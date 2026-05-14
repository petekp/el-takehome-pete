import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'
import { withBackoff } from '@/lib/retry'

// The workshop's opening framing line — the first thing Claude says inside
// the workshop chat panel. Sets up the same prediction the user saw in the
// chat exchange, but reframed visually: the viz is preloaded with the
// scenario, and the user is now *watching* it play out rather than re-quizzed.
//
// The answer space (options) is intentionally reused from the chat-side
// prediction primitive (see KICKOFF "Same answer space as chat prediction,
// framed visually") — the client supplies those options. This endpoint
// returns the framing only.

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

const OPENING_TOOL = {
  name: 'emit_workshop_opening',
  description: 'Emit the workshop opening framing line.',
  input_schema: {
    type: 'object' as const,
    properties: {
      framing: {
        type: 'string',
        description:
          'Two short lines (separated by a blank line in markdown). First: a single sentence orienting the user — "this is X, made manipulable." Second: the prediction prompt, made visual — invokes the viz state ("two resolving at ~200ms, the third never settling") and ends with a question. Total ≤ 3 sentences. No headings, no bullet lists.',
      },
    },
    required: ['framing'],
  },
}

function openingSystemPrompt(concept: Concept): string {
  return [
    `You are writing the opening framing for the workshop view of: ${concept.descriptors.title}.`,
    '',
    'The workshop is a manipulable view of Promise.all — three timeline tracks (two resolve at ~200ms, one hangs forever) plus an aggregate "Promise.all" track underneath. The user is about to make a prediction; the same prediction they saw in the chat exchange, but now they\'re watching the visualization rather than imagining it.',
    '',
    'Your job: emit a short framing line (~2-3 sentences total). It should:',
    '  - Open by orienting the user: "this is X, made manipulable." Or similar — Promise.all rendered in tracks, not in code.',
    '  - Then pose the prediction visually, naming the configuration concretely: "two resolve at ~200ms, the third never settles — what happens to the aggregate Promise.all track?" or close.',
    "  - Make clear we're WATCHING the answer play out, not re-quizzing. The user already predicted once; this is now an animated test of their prediction.",
    '  - No headings, no bulleted lists. No emoji. No exclamation marks.',
    "  - Peer-level, calm. Like Claude sitting next to you saying \"here, watch this.\"",
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
      envelope.meta({ isArc: false, conceptId })

      try {
        const res = await withBackoff(() =>
          client.messages.create({
            model: MODEL,
            max_tokens: 768,
            system: openingSystemPrompt(concept),
            messages: [{ role: 'user', content: 'Emit the workshop opening framing now.' }],
            tools: [OPENING_TOOL],
            tool_choice: { type: 'tool', name: OPENING_TOOL.name },
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
