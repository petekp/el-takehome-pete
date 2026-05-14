import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'
import { withBackoff } from '@/lib/retry'

// The predict beat: generates the framing prose + three multiple-choice
// options for a concept. Tool-use gives us structured output in one shot;
// the envelope wraps it as a single `data` event so the client can render
// the prediction surface and keep the misconception tags for the reveal.

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

const PREDICTION_TOOL = {
  name: 'emit_prediction_beat',
  description:
    'Emit the framing prompt and three multiple-choice options for the prediction beat.',
  input_schema: {
    type: 'object' as const,
    properties: {
      framing: {
        type: 'string',
        description:
          'One or two short sentences that pose the prediction question concretely. Ends with a question. No headings or list formatting.',
      },
      options: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        description:
          'Exactly three options: one correct ("truth"), one mirroring Promise.allSettled, one assuming a default timeout.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description:
                'Stable id matching the misconceptionTag (e.g. "truth", "allSettled", "default-timeout").',
            },
            label: {
              type: 'string',
              description: 'A one-sentence option that fits comfortably on a single line.',
            },
            isCorrect: { type: 'boolean' },
            misconceptionTag: {
              type: 'string',
              enum: ['allSettled', 'default-timeout', 'truth'],
              description:
                "'truth' for the correct option, 'allSettled' for the option mirroring Promise.allSettled's behavior, 'default-timeout' for a plausible-but-wrong default timeout assumption.",
            },
          },
          required: ['id', 'label', 'isCorrect', 'misconceptionTag'],
        },
      },
    },
    required: ['framing', 'options'],
  },
}

function predictionSystemPrompt(concept: Concept): string {
  return [
    `You are designing a quick prediction beat for the concept: ${concept.descriptors.title}.`,
    '',
    'The user just chose to think through the problem before getting the wrapper. Emit a framing question and exactly three multiple-choice options about what Promise.all does when one of its inner promises hangs forever (never resolves, never rejects).',
    '',
    'Guidance:',
    '  - Framing: concrete, peer-level, plainspoken. One or two short sentences ending with a question. Ground it in a small concrete scenario (e.g. three fetches, one hangs). No headings, no preamble, no hedging like "best guess is fine".',
    '  - Three options, each a single sentence that fits on one line:',
    '      • CORRECT — Promise.all is all-or-nothing: while one promise hangs, the whole Promise.all hangs too. Tag this `truth` (isCorrect: true, id: "truth").',
    "      • WRONG — mirrors Promise.allSettled's behavior: resolves with whatever finished, marks the hung one. Tag `allSettled` (isCorrect: false, id: \"allSettled\").",
    '      • WRONG — assumes a default timeout: waits some amount and then throws. Tag `default-timeout` (isCorrect: false, id: "default-timeout").',
    '  - Keep the misconceptions plausible — they should sound like reasonable guesses, not strawmen.',
    "  - Vary how the options open. They should NOT all start with the same word. Prefer subject pronouns or verb-led phrasing (e.g. \"It hangs forever too…\", \"You get back what finished — the third stays pending.\", \"Waits a built-in timeout, then rejects.\") so the three options scan as distinct shapes, not minor variants of one another.",
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as { conceptId: ConceptId }
  const { conceptId } = body
  const concept = getConcept(conceptId)
  const client = new Anthropic({ apiKey })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      // Non-arc meta — arc state is already set client-side; this beat just
      // emits the structured payload.
      envelope.meta({ isArc: false, conceptId })

      try {
        const res = await withBackoff(() =>
          client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: predictionSystemPrompt(concept),
            messages: [{ role: 'user', content: 'Emit the prediction beat now.' }],
            tools: [PREDICTION_TOOL],
            tool_choice: { type: 'tool', name: PREDICTION_TOOL.name },
          }),
        )
        const toolUse = res.content.find((b) => b.type === 'tool_use')
        if (toolUse?.type !== 'tool_use') {
          envelope.error('Model produced no tool_use block', false)
        } else {
          const input = toolUse.input as Record<string, unknown>
          envelope.data({ framing: input.framing, options: input.options })
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
