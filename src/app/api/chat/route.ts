import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import {
  clientMatchTrigger,
  CONCEPTS,
  getConcept,
  type Concept,
  type ConceptId,
} from '@/lib/concepts'
import { defaultRetryable, withBackoff } from '@/lib/retry'
import {
  AFFORDANCE_PLACEHOLDER,
  ARTIFACT_PLACEHOLDER,
  postArtifactSystemPrompt,
  sanitizeAssistantTextForModel,
} from '@/lib/artifact-narration'
import type { ArtifactInteractionSummary } from '@/lib/artifact-interaction'

// Node runtime (Fluid Compute on Vercel). The classifier requires tool-use,
// which doesn't run reliably on the edge runtime.

const apiKey = process.env.ANTHROPIC_API_KEY

const CLASSIFIER_MODEL = 'claude-haiku-4-5'
const AFFORDANCE_MODEL = 'claude-sonnet-4-6'
const STREAM_HEADERS = {
  'Content-Type': ENVELOPE_CONTENT_TYPE,
  'Cache-Control': 'no-cache',
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

type IncomingMessage = {
  role: 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'image'
            source: { type: 'base64'; media_type: ImageMediaType; data: string }
          }
      >
}

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
    'registered learning concept. The user may include image attachments — treat them',
    'as part of the message: a handwritten VSEPR chart or a Lewis-structure drawing of',
    'XeF2 alongside the text is a stronger signal, not a weaker one.',
    '',
    'Be reasonably permissive — if the message clearly fits the criteria, return the',
    'conceptId. If the message is a generic question with no concept signal, return null.',
    '',
    'Concepts:',
    conceptLines,
  ].join('\n')
}

/**
 * Build the latest user message in a form the classifier can consume. The
 * classifier model handles images natively, so we pass the same content
 * blocks through.
 */
function latestUserBlocks(messages: IncomingMessage[]): IncomingMessage['content'] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return null
}

function flattenUserText(content: IncomingMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function locallyClassify(content: IncomingMessage['content'] | null): ClassifierResult {
  if (!content) return { conceptId: null, reasoning: '' }
  const heuristic = clientMatchTrigger(flattenUserText(content))
  return heuristic
    ? { conceptId: heuristic, reasoning: 'keyword heuristic matched on user text' }
    : { conceptId: null, reasoning: 'keyword heuristic did not match user text' }
}

async function classify(
  client: Anthropic,
  latestContent: IncomingMessage['content'],
): Promise<ClassifierResult> {
  // Short-circuit on the keyword heuristic: when the user's text clearly
  // matches a concept (e.g. "XeF2" + lone-pair language), skip the
  // model round-trip. Cheaper and bulletproof for the demo trigger.
  const local = locallyClassify(latestContent)
  if (local.conceptId) return local

  const res = await withBackoff(() =>
    client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 512,
      system: classifierSystemPrompt(),
      messages: [{ role: 'user', content: latestContent }],
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
    `You are Claude, talking with a returning gen-chem student who is grinding through molecular geometry. She has just asked about ${concept.descriptors.title}.`,
    '',
    "Her question is about XeF2 — 5 electron domains, 3 lone pairs, molecular geometry linear, electron-domain geometry trigonal bipyramidal. She has attached two photos: her course's VSEPR molecular-geometry chart (with handwritten annotations) and her own Lewis structure for XeF2 with three lone pairs on Xe. She thinks the lone pairs are physically blocking any bonds from forming on Xe, and she finds the wedge-and-dash drawing in the chart confusing.",
    '',
    "Her intuition is HALF right: yes, lone pairs occupy space and push F's around. The half that's off is the spatial part — the three lone pairs sit in the equatorial plane of a trigonal bipyramid, and the two F atoms end up axial, which is exactly why the molecule is linear. The 2D Lewis structure can't show her that.",
    '',
    'You can just answer her directly — but the real gap is spatial, and a verbal answer alone will land flat. Offer to look at the molecule together first.',
    '',
    "Your response is two short beats of conversational prose. Reference the attachments directly — you can see her chart and her Lewis structure. Acknowledge her intuition by name (her word is \"blocking\"). No headings, no bullets, no lists, no labels like \"Option A\". Two to four short sentences. The voice is a jovial knowledgeable friend who remembers what it was like to take chemistry — not a tutor, not a chemistry professor.",
    '',
    "Concretely: open by naming what you can see — the row on the chart she's stuck on and her Lewis drawing — and validate that the wedge-and-dash is genuinely confusing for this cell. Then one sentence saying her blocking intuition is half-right and the half that's off is the spatial part. Then offer the choice in plain language — something like \"want to look at it together first, or should I just answer it?\" The offer is light, easy to decline. Do not write the button labels yourself; just emit the tag.",
    '',
    'End your message with EXACTLY this on its own line, with nothing after it:',
    AFFORDANCE_PLACEHOLDER,
    '',
    'Tone: warm, peer-level, plainspoken. No lecturing. No "of course!" or "great question!" — just speak.',
  ].join('\n')
}

function fallbackAffordanceText(concept: Concept): string {
  return [
    "I'm having trouble reaching the Anthropic API right now, so I'm using the built-in demo script for this part.",
    '',
    concept.descriptors.fallback.affordance.intro,
    '',
    AFFORDANCE_PLACEHOLDER,
  ].join('\n')
}

function fallbackArcResponse(
  concept: Concept,
  reasoning: string,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      envelope.meta({
        isArc: true,
        conceptId: concept.id,
        reasoning,
        descriptors: { title: concept.descriptors.title },
      })
      envelope.text(fallbackAffordanceText(concept))
      envelope.done()
    },
  })

  return new Response(stream, { headers: STREAM_HEADERS })
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    model: string
    messages: IncomingMessage[]
    artifactInteraction?: ArtifactInteractionSummary | null
  }
  const { model, messages, artifactInteraction } = body
  const latestContent = latestUserBlocks(messages) ?? ''

  // If an artifact has already been opened in this chat, suppress the
  // affordance/arc path even if the classifier matches: she's almost
  // certainly asking ABOUT the artifact (or in its wake), not asking for
  // a fresh walkthrough on the same concept. We detect this by looking
  // for the raw <artifact/> placeholder in the assistant history.
  const arcAlreadyResolved = messages.some(
    (m) =>
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      m.content.trim() === ARTIFACT_PLACEHOLDER,
  )

  if (!apiKey) {
    const local = !arcAlreadyResolved ? locallyClassify(latestContent) : null
    if (local?.conceptId) {
      return fallbackArcResponse(
        getConcept(local.conceptId),
        `${local.reasoning}; Anthropic API key unavailable`,
      )
    }

    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const client = new Anthropic({ apiKey })

  // 1. Classify. Failures fall through to non-arc chat — never block the chat
  //    response on a flaky classifier. Skipped when an arc is already
  //    resolved (no need to re-fire).
  let classified: ClassifierResult = { conceptId: null, reasoning: '' }
  if (latestContent && !arcAlreadyResolved) {
    try {
      classified = await classify(client, latestContent)
    } catch (err) {
      console.error('Classifier failed; falling back to normal chat', err)
    }
  }

  const concept = classified.conceptId ? getConcept(classified.conceptId) : null
  const isArc = concept !== null && !arcAlreadyResolved

  // Sanitize UI-only tags out of the assistant history before they reach
  // the model: replace bare <artifact/> placeholders with a first-person
  // narration of the artifact, and strip trailing <affordance/> tags.
  const modelMessages: IncomingMessage[] = messages.map((m) => {
    if (m.role !== 'assistant' || typeof m.content !== 'string') return m
    return { role: 'assistant', content: sanitizeAssistantTextForModel(m.content) }
  })

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

      // Retry transient upstream failures (5xx/429) — but only before any
      // tokens have hit the wire. Once we've started streaming text the
      // envelope is past the point of no return; retrying would double-write.
      let textEmitted = false
      let accumulatedText = ''
      const streamArgs =
        isArc && concept
          ? {
              model: AFFORDANCE_MODEL,
              max_tokens: 1024,
              system: affordanceSystemPrompt(concept),
              messages: modelMessages,
            }
          : {
              model,
              max_tokens: 8096,
              // When the chat history shows a rendered artifact, prime the
              // model with a calibration block that (a) tells it the
              // artifact is real, and (b) when an interaction summary is
              // attached, lays out what she has actually done inside it.
              ...(arcAlreadyResolved
                ? {
                    system: postArtifactSystemPrompt(
                      artifactInteraction ?? null,
                    ),
                  }
                : {}),
              messages: modelMessages,
            }
      try {
        await withBackoff(
          async () => {
            const messageStream = client.messages.stream(streamArgs)
            messageStream.on('text', (delta) => {
              textEmitted = true
              accumulatedText += delta
              envelope.text(delta)
            })
            await messageStream.finalMessage()
          },
          { isRetryable: (err) => !textEmitted && defaultRetryable(err) },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown upstream error'
        if (isArc && concept) {
          console.error('Affordance stream failed; falling back to canned arc response', err)
          if (!accumulatedText.includes(AFFORDANCE_PLACEHOLDER)) {
            const prefix = textEmitted ? '\n\n' : ''
            envelope.text(`${prefix}${fallbackAffordanceText(concept)}`)
          }
        } else {
          envelope.error(message, true)
        }
      } finally {
        envelope.done()
      }
    },
  })

  return new Response(stream, {
    headers: STREAM_HEADERS,
  })
}
