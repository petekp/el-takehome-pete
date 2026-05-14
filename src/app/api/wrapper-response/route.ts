import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type ConceptId } from '@/lib/concepts'

// The γ.2 wrapper path: honors the literal ask (write the wrapper) but
// quietly produces something that actually fixes the real problem — a
// try/catch outer wrapper containing AbortController + timeout primitives.
// No learning ambush; no scolding. See KICKOFF "wrapper path / learning path".

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

function wrapperSystemPrompt(conceptId: ConceptId, afterLearning: boolean): string {
  const concept = getConcept(conceptId)
  if (afterLearning) {
    return [
      `You are Claude. The user just went through a short predict→reveal→reflect exchange about ${concept.descriptors.title}. They now understand WHY a bare try/catch won't catch a hung promise. Now you're closing the loop by giving them the wrapper code itself.`,
      '',
      'Your response is the post-card continuation. It should:',
      '  1. Open with a short bridging line that picks up from the card — something like "Now — about your wrapper. Here\'s what\'ll actually catch a hang:" — but generated naturally, not quoted.',
      '  2. Go straight to the code. No re-explaining the concept (the reveal already did that). One short clause is fine — e.g. "this wires up an AbortController, races each promise against the timer, and lets the outer try/catch do its job."',
      '  3. Provide a clean code snippet (fenced TypeScript block) implementing the wrapper: a function that takes an array of promises plus a timeout, races each promise against an AbortController-driven rejection, and wraps the whole Promise.all in try/catch.',
      '  4. End with a short, friendly line telling them to drop their fetches into it.',
      '',
      'Tone: peer-level, warm, plainspoken. Do not repeat the conceptual explanation. Do not emit any custom tags.',
    ].join('\n')
  }
  return [
    `You are Claude. The user asked for a wrapper around Promise.all — specifically a try/catch to stop their request from hanging. The underlying concept they're hitting is: ${concept.descriptors.title}.`,
    '',
    'A bare try/catch around Promise.all WILL NOT fix this — a hanging promise never throws, so there is nothing to catch. The fix is to give the hung request a way to fail: an AbortController paired with a timeout, or a Promise.race against a timer.',
    '',
    'Your response should:',
    '  1. Briefly honor their ask — give them the wrapper they want.',
    '  2. Surface, in one sentence at most, that a plain try/catch alone would not have helped, and that you have therefore put a timeout inside.',
    '  3. Provide a clean code snippet (fenced TypeScript block) implementing the wrapper: a function that takes an array of promises plus a timeout, races each promise against an AbortController-driven rejection, and wraps the whole Promise.all in try/catch.',
    '  4. End with a short, friendly line telling them to drop their fetches into it.',
    '',
    'Tone: peer-level, plainspoken, warm, no lecturing. Do not present the affordance buttons again. Do not emit any custom tags.',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    afterLearning?: boolean
  }
  const { conceptId, messages, afterLearning = false } = body
  const client = new Anthropic({ apiKey })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      // Meta is non-arc — arc state is already set client-side; this endpoint
      // just streams the response.
      envelope.meta({ isArc: false, conceptId })

      try {
        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 2048,
          system: wrapperSystemPrompt(conceptId, afterLearning),
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
