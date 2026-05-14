import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { CONCEPTS, getConcept, type Concept, type ConceptId } from '@/lib/concepts'
import { withBackoff } from '@/lib/retry'

// Node runtime (Fluid Compute on Vercel). The classifier requires tool-use,
// which doesn't run reliably on the edge runtime.

const apiKey = process.env.ANTHROPIC_API_KEY

const CLASSIFIER_MODEL = 'claude-haiku-4-5'
const AFFORDANCE_MODEL = 'claude-sonnet-4-6'

type ClassifierResult = {
  conceptId: ConceptId | null
  reasoning: string
}

const CLASSIFIER_TOOL = {
  name: 'classify_concept',
  description:
    "Classify whether the user's most recent message belongs to a registered learning concept.",
  input_schema: {
    type: 'object' as const,
    properties: {
      conceptId: {
        type: ['string', 'null'],
        enum: [...CONCEPTS.map((c) => c.id), null],
        description:
          'The id of the matching concept, or null if the message does not match any concept.',
      },
      reasoning: {
        type: 'string',
        description:
          "One short sentence explaining the decision. If conceptId is null, what was missing.",
      },
    },
    required: ['conceptId', 'reasoning'],
  },
}

function classifierSystemPrompt(): string {
  const conceptLines = CONCEPTS.map(
    (c) => `- id: "${c.id}"\n  criteria: ${c.triggerCriteria}`,
  ).join('\n\n')
  return [
    'You are a classifier that decides whether an incoming user message belongs to a',
    'registered learning concept. Be conservative — only return a conceptId if the',
    'message clearly matches the concept\'s criteria. If the user is asking a generic',
    'question with no clear concept signal, return null.',
    '',
    'Concepts:',
    conceptLines,
  ].join('\n')
}

async function classify(client: Anthropic, latestUserMessage: string): Promise<ClassifierResult> {
  const res = await withBackoff(() =>
    client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 512,
      system: classifierSystemPrompt(),
      messages: [{ role: 'user', content: latestUserMessage }],
      tools: [CLASSIFIER_TOOL],
      tool_choice: { type: 'tool', name: CLASSIFIER_TOOL.name },
    }),
  )
  const toolUse = res.content.find((b) => b.type === 'tool_use')
  if (toolUse?.type !== 'tool_use') {
    return { conceptId: null, reasoning: 'classifier produced no tool_use block' }
  }
  const input = toolUse.input as ClassifierResult
  return {
    conceptId: input.conceptId ?? null,
    reasoning: input.reasoning ?? '',
  }
}

function affordanceSystemPrompt(concept: Concept): string {
  return [
    `You are Claude, talking with a student who's just hit a question about ${concept.descriptors.title}.`,
    '',
    "They want to know why ammonia is pyramidal but methane is tetrahedral. You CAN just answer that — but the real gap underneath is that their textbook keeps showing the same molecule in different 2D notations (Lewis structures, geometry charts, wedge-and-dash) without ever showing them the underlying 3D structure those notations are gesturing at. The chart isn't doing it for them. You're going to offer them an easy choice: just give the short verbal answer, or take a minute to look at the molecule together first.",
    '',
    'Your response is two short beats of conversational prose. No headings, no bullets, no lists, no labels like "Option A". No announcement that this is a learning feature. Two sentences, maybe three. The voice is a jovial knowledgeable friend who remembers what it was like to take chemistry — not a tutor, not a chemistry professor.',
    '',
    'Concretely: one sentence saying you can just answer it, but it sounds like the chart isn\'t doing it and there\'s a thing about how textbook representations work that might help first. One sentence offering the choice in plain language — something like "want to look at it together first, or should I just answer it?" The offer is light, easy to decline. Do not write the button labels yourself; just emit the tag.',
    '',
    'End your message with EXACTLY this on its own line, with nothing after it:',
    '<affordance/>',
    '',
    'Tone: warm, peer-level, plainspoken. No lecturing. No "of course!" or "great question!" — just speak.',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    model: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  const { model, messages } = body
  const client = new Anthropic({ apiKey })
  const latestUserMessage =
    [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // 1. Classify. Failures fall through to non-arc chat — never block the chat
  //    response on a flaky classifier.
  let classified: ClassifierResult = { conceptId: null, reasoning: '' }
  if (latestUserMessage) {
    try {
      classified = await classify(client, latestUserMessage)
    } catch (err) {
      console.error('Classifier failed; falling back to normal chat', err)
    }
  }

  const concept = classified.conceptId ? getConcept(classified.conceptId) : null
  const isArc = concept !== null

  // 2. Stream the response. Meta first (arc-aware), then text deltas, then done.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)

      if (isArc && concept) {
        envelope.meta({
          isArc: true,
          conceptId: concept.id,
          reasoning: classified.reasoning,
          descriptors: { title: concept.descriptors.title },
        })
      } else {
        envelope.meta({ isArc: false, reasoning: classified.reasoning })
      }

      try {
        const messageStream = client.messages.stream(
          isArc && concept
            ? {
                model: AFFORDANCE_MODEL,
                max_tokens: 1024,
                system: affordanceSystemPrompt(concept),
                messages,
              }
            : {
                model,
                max_tokens: 8096,
                messages,
              },
        )
        messageStream.on('text', (delta) => envelope.text(delta))
        await messageStream.finalMessage()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown upstream error'
        envelope.error(message, true)
      } finally {
        envelope.done()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': ENVELOPE_CONTENT_TYPE,
      'Cache-Control': 'no-cache',
    },
  })
}
