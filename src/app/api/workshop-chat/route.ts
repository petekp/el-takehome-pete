import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'

// In-workshop chat. A separate thread from the main /api/chat — concept-aware,
// optionally seeded with the user's earlier reflection so Claude knows what
// they already noticed. Per PRD §4 "In-workshop chat":
//   - Fresh thread, NOT a continuation of the original conversation
//   - Concept-aware system prompt
//   - Has access to the user's reflection if any
//   - Can propose additional predict-reveal moments at appropriate points

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

function workshopChatSystemPrompt(concept: Concept, reflectionText: string): string {
  const reflectionBlock =
    reflectionText.trim().length > 0
      ? `The user's earlier reflection (what stuck for them from the predict-reveal-reflect exchange they just finished): "${reflectionText.slice(0, 1000)}". Use this as context — what they care about, what they\'ve already understood. You don\'t need to re-explain those parts.`
      : 'The user skipped the reflection. Treat them as freshly arrived in the workshop.'

  return [
    `You are Claude, sitting inside the workshop view for the concept: ${concept.descriptors.title}.`,
    '',
    'The workshop is a manipulable view of Promise.all rendered as timeline tracks. Two promises resolve at ~200ms; the third hangs forever. The aggregate Promise.all track sits underneath and never settles. The user just predicted what would happen and watched it play out.',
    '',
    reflectionBlock,
    '',
    'Your job: answer the user\'s questions about the visualization or the concept. You can:',
    '  - Explain what specific parts of the viz show.',
    '  - Discuss related JavaScript machinery (AbortController, Promise.race, Promise.allSettled, microtasks, the event loop, unhandled rejections).',
    '  - Propose a small follow-up exercise if it would land — e.g. "what if all three hung?" or "what if the third rejected at 500ms?". Phrase as an invitation, not homework.',
    '  - Be concise: ~1-3 short paragraphs per response. No giant lectures.',
    '',
    'Tone: warm, peer-level, plainspoken. Inline `code` for short identifiers is fine. Reserve fenced code blocks for genuinely useful 3+ line snippets. NEVER preview your structure ("First I\'ll explain X, then Y") — just respond. Treat this as a quiet aside, not a tutorial.',
    '',
    'Do NOT emit custom tags (no <affordance/>, no <prediction-options/>, etc.) — this thread renders the model\'s prose directly. If you want to propose a predict-reveal, just describe it conversationally and leave the user to ask for it.',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    reflectionText?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  const { conceptId, reflectionText = '', messages } = body
  const concept = getConcept(conceptId)
  const client = new Anthropic({ apiKey })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      envelope.meta({ isArc: false, conceptId })

      try {
        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 2048,
          system: workshopChatSystemPrompt(concept, reflectionText),
          messages,
        })
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
