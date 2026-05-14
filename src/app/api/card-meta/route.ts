import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'
import { withBackoff } from '@/lib/retry'

// The inline card metadata — the framing line preceding the card and the
// concept title rendered inside it. Per PRD §3.4: framing should signal
// "something durable has been produced, without overclaiming or feeling
// sentimental." The conceptTitle is the canonical title from the registry
// (the prompt is told to use it verbatim — no drift).

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

const CARD_TOOL = {
  name: 'emit_card_meta',
  description: 'Emit the framing line and concept title for the inline card.',
  input_schema: {
    type: 'object' as const,
    properties: {
      framing: {
        type: 'string',
        description:
          'One short sentence that introduces the card. Signals something durable was produced, without overclaiming or feeling sentimental. Examples of the right register: "Got it. Kept this for you:" or "Saved this one." or "Held onto this:". Avoid emoji, exclamation marks, and self-congratulatory phrasing.',
      },
      conceptTitle: {
        type: 'string',
        description:
          'The concept title to render on the card. Use the canonical title provided in the system prompt VERBATIM — do not paraphrase, shorten, or rewrite it.',
      },
    },
    required: ['framing', 'conceptTitle'],
  },
}

function cardSystemPrompt(concept: Concept, reflectionText: string): string {
  return [
    `You are emitting metadata for the inline card that closes the structured exchange about: ${concept.descriptors.title}.`,
    '',
    `CANONICAL CONCEPT TITLE (use verbatim in conceptTitle): "${concept.descriptors.title}"`,
    '',
    reflectionText.trim().length > 0
      ? `The user's reflection (you don't need to quote it, just be aware of the tone): "${reflectionText.slice(0, 500)}"`
      : 'The user skipped the reflection — the card stands on its own.',
    '',
    'Your job: emit a framing line + the conceptTitle.',
    '',
    'Guidance for framing:',
    "  - One short sentence. Signals durability — something was kept — without claiming a big win.",
    '  - Plain, calm register. Not "Awesome!" or "Great reflection!" — just a quiet acknowledgement.',
    '  - The card itself does the visual lifting; the framing is the small bridge between the chat and the card.',
    '  - Should feel like Claude handing them a notecard, not announcing a achievement.',
    '',
    'Guidance for conceptTitle:',
    `  - Use the canonical title exactly: "${concept.descriptors.title}".`,
    "  - Do not paraphrase, shorten, casing-shift, or re-style.",
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    reflectionText: string
  }
  const { conceptId, reflectionText } = body
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
            system: cardSystemPrompt(concept, reflectionText),
            messages: [{ role: 'user', content: 'Emit the card metadata now.' }],
            tools: [CARD_TOOL],
            tool_choice: { type: 'tool', name: CARD_TOOL.name },
          }),
        )
        const toolUse = res.content.find((b) => b.type === 'tool_use')
        if (toolUse?.type !== 'tool_use') {
          envelope.error('Model produced no tool_use block', false)
        } else {
          const input = toolUse.input as Record<string, unknown>
          envelope.data({ framing: input.framing, conceptTitle: input.conceptTitle })
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
