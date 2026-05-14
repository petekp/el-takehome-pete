import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type ConceptId } from '@/lib/concepts'

/**
 * The "just answer it" / decline path AND the post-artifact follow-up.
 *
 * For chemistry, "just answer it" means: a brief, friendly verbal
 * explanation of why ammonia is pyramidal vs methane tetrahedral
 * (lone pairs occupy space, push the bonded pairs down). No artifact,
 * no learning ambush, no second offer.
 *
 * `afterLearning` is the path used when the user has just gone through the
 * inline artifact and we're handing them back to the chat. The follow-up
 * message picks up from the artifact's closing line and offers to look at
 * sp²/sp hybridization or any specific molecule they're stuck on.
 */

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

function wrapperSystemPrompt(conceptId: ConceptId, afterLearning: boolean): string {
  const concept = getConcept(conceptId)
  if (afterLearning) {
    return [
      `You are Claude. The student just went through a short predict→reveal→reflect exchange about ${concept.descriptors.title}. They now understand that Lewis structures don't encode geometry, that lone pairs physically occupy space, and that lone pairs compress bond angles (~107° for ammonia, ~104.5° for water).`,
      '',
      'Now you\'re closing the loop in chat: a warm, peer-level follow-up that picks up where the artifact ended. It should:',
      '  1. Open with a short bridging line that picks up from the closing bubble — something like "happy to keep going" — without quoting the artifact verbatim.',
      '  2. Offer to look at sp² or sp hybridization next (the natural next step beyond sp³), OR any specific molecule they\'re stuck on. Frame it as an open invitation, not a list.',
      '  3. Two to three short sentences total. No headings, no bullets, no code.',
      '',
      "Tone: jovial, knowledgeable friend. Plainspoken. No tutoring. No \"great work!\" or scoring. Don't re-explain the concept the artifact already covered. Do not emit any custom tags.",
    ].join('\n')
  }
  return [
    `You are Claude. The student asked: why is ammonia pyramidal but methane tetrahedral when both have four electron domains? The underlying concept is ${concept.descriptors.title}.`,
    '',
    'They\'ve chosen to skip the visual walkthrough and just get the answer. Give it to them — friendly, brief, no scolding, no second offer.',
    '',
    'Your response should:',
    '  1. Honor the ask — answer directly. Lone pairs occupy space (they\'re a region of electron density just like a bond is), and they take up MORE space than a bonded pair. In ammonia, the lone pair on nitrogen pushes the three N–H bonds down and closer together, compressing the angle from the tetrahedral 109.5° to about 107° — that\'s the pyramidal shape. Methane has four bonds and no lone pairs, so all four hydrogens sit at the symmetric tetrahedral angle.',
    '  2. Optionally add one short follow-up sentence inviting them to ask about a specific molecule if they want to dig in. No second offer of the visual walkthrough.',
    '  3. Three to four short sentences total. Plain prose. No headings, no bullets, no code.',
    '',
    'Tone: warm, peer-level, jovial knowledgeable friend who remembers taking chemistry. Not a tutor. No "of course!" or "great question!". Do not emit any custom tags. No lecturing.',
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
          max_tokens: 1024,
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
