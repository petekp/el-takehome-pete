import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'
import { withBackoff } from '@/lib/retry'

// The map's ghost-node metadata — four adjacent concepts the user could
// venture toward from this one. Each has a short label (renders inside the
// dashed node) and a hint (shown inline when the node is tapped).
//
// PRD §3.5: "Labels are generated via API based on the conversation."
// Hint phrasing is invitational ("explore how this differs from…") — see
// KICKOFF principle "friction only when legible."

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

const GHOST_TOOL = {
  name: 'emit_ghost_nodes',
  description: 'Emit exactly four adjacent-concept ghost nodes for the map.',
  input_schema: {
    type: 'object' as const,
    properties: {
      ghosts: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        description:
          'Exactly four ghost-node entries. Each is an adjacent concept the user might venture to next.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description:
                'Stable kebab-case id (e.g., "all-settled", "abort-controller"). Lowercase, alphanumeric + dashes only.',
            },
            label: {
              type: 'string',
              description:
                'Short label rendered inside the dashed node (2–4 words max, e.g. "Promise.allSettled", "AbortController", "Unhandled rejections"). Avoid trailing punctuation.',
            },
            hint: {
              type: 'string',
              description:
                'One short sentence shown when the user taps the node. Invitational — gestures at what venturing there would surface. NEVER imperative. Examples: "the sibling that does what your prediction suggested", "how a hung request is given a way to fail". One sentence, no trailing period required.',
            },
          },
          required: ['id', 'label', 'hint'],
        },
      },
    },
    required: ['ghosts'],
  },
}

function ghostSystemPrompt(concept: Concept, reflectionText: string): string {
  const reflectionBlock =
    reflectionText.trim().length > 0
      ? `The user's reflection: "${reflectionText.slice(0, 500)}". The ghost selection can lean toward angles they didn't keep — territory still worth exploring.`
      : 'The user skipped reflection — pick a balanced mix of adjacent angles.'

  return [
    `You are picking four adjacent-concept "ghost nodes" for a personal concept map. The user just learned about: ${concept.descriptors.title}.`,
    '',
    reflectionBlock,
    '',
    'Pick exactly four adjacent concepts that:',
    '  - Live near this concept conceptually (same neighborhood of the language / runtime).',
    '  - Each gestures at a different angle (sibling APIs, escape hatches, related failure modes, what-NOT-to-do, etc.) — avoid four variations of the same point.',
    '  - Are concrete enough to be a real "next thing to look at," not abstract categories.',
    '',
    'Strongly preferred shape for this concept: include',
    '  - the sibling method that matches a common misconception (Promise.allSettled),',
    '  - a settling-on-first-resolution sibling (Promise.race),',
    '  - the practical escape hatch the wrapper depends on (AbortController OR timeouts),',
    '  - one "the flip side of all-or-nothing" — unhandled rejections / fast-fail behavior.',
    'You may swap one of these for a stronger fit if your judgement says so.',
    '',
    'For each entry emit a short label (2–4 words) and a one-sentence hint. The hint should feel like Claude leaning over and saying "if you head this way, you\'ll find ___" — invitational, plainspoken, peer-level. Not "Click to learn more!" or "Reflect on…".',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    reflectionText?: string
  }
  const { conceptId, reflectionText = '' } = body
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
            max_tokens: 1024,
            system: ghostSystemPrompt(concept, reflectionText),
            messages: [{ role: 'user', content: 'Emit the four ghost nodes now.' }],
            tools: [GHOST_TOOL],
            tool_choice: { type: 'tool', name: GHOST_TOOL.name },
          }),
        )
        const toolUse = res.content.find((b) => b.type === 'tool_use')
        if (toolUse?.type !== 'tool_use') {
          envelope.error('Model produced no tool_use block', false)
        } else {
          const input = toolUse.input as Record<string, unknown>
          envelope.data({ ghosts: input.ghosts })
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
