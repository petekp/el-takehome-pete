import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'
import { withBackoff } from '@/lib/retry'

// The reflection beat's framing line — generated based on the concept and the
// reveal that just landed. Per PRD §3.3 guidance: "invite reflection by naming
// a few specific candidate angles the user might focus on, end with 'or
// something else that stuck'". Tool-use for one-shot structured output.

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

const REFLECTION_TOOL = {
  name: 'emit_reflection_framing',
  description:
    "Emit the reflection beat's framing line: invite reflection by naming candidate angles.",
  input_schema: {
    type: 'object' as const,
    properties: {
      framing: {
        type: 'string',
        description:
          'One to two sentences. Names 2-3 concrete candidate angles the user might want to keep, then ends with the phrase "or something else that stuck" (or a close variant). No headings. No imperative "reflect on…" — invitational, not assigning homework.',
      },
    },
    required: ['framing'],
  },
}

function reflectionSystemPrompt(concept: Concept, revealText: string): string {
  return [
    `You are designing the framing line for a reflection beat that follows a reveal about: ${concept.descriptors.title}.`,
    '',
    'CONTEXT — what the user just heard (the reveal):',
    revealText.slice(0, 1500),
    '',
    'Your job: emit one to two short sentences that invite the user to capture a takeaway from what they just heard. Guidance:',
    '  - Name 2-3 specific candidate angles they might focus on. Draw from the reveal itself — quote or paraphrase phrases the reveal used (e.g. "the all-or-nothing shape", "the part about try/catch needing something to catch", "that Promise.allSettled is the sibling that does what you expected").',
    '  - End with the phrase "or something else that stuck" (or a near variant like "or anything else worth holding onto"). This signals the user can keep something the reveal didn\'t name.',
    '  - Invitational, peer-level. NEVER imperative. Avoid "Reflect on…" or "Please share…". Try "Anything you want to keep from that?" or "What\'s the part you want to hold onto?".',
    '  - One to two short sentences. No headings, no preamble.',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    revealText: string
  }
  const { conceptId, revealText } = body
  const concept = getConcept(conceptId)
  const client = new Anthropic({ apiKey })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      envelope.meta({ isArc: false, conceptId })

      try {
        const res = await withBackoff(() =>
          client.messages.create({
            model: MODEL,
            max_tokens: 512,
            system: reflectionSystemPrompt(concept, revealText),
            messages: [{ role: 'user', content: 'Emit the reflection framing now.' }],
            tools: [REFLECTION_TOOL],
            tool_choice: { type: 'tool', name: REFLECTION_TOOL.name },
          }),
        )
        const toolUse = res.content.find((b) => b.type === 'tool_use')
        if (toolUse?.type !== 'tool_use') {
          envelope.error('Model produced no tool_use block', false)
        } else {
          const input = toolUse.input as Record<string, unknown>
          envelope.data({ framing: input.framing })
        }
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
