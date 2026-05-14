import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type ConceptId } from '@/lib/concepts'

/**
 * The "just answer it" / decline path AND the post-artifact follow-up.
 *
 * For XeF2, "just answer it" means: a brief, friendly verbal explanation —
 * 5 domains, 3 lone pairs claim the equatorial plane of a trigonal
 * bipyramid (more room there, only two 90° neighbors instead of three),
 * leaving two axial positions for the F's, which is why it reads as linear.
 *
 * `afterLearning` is the path used when the user has just gone through the
 * inline artifact and we're handing them back to the chat. It picks up
 * from the artifact's closing line and offers to look at any other row of
 * her chart she's stuck on.
 */

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

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

function wrapperSystemPrompt(conceptId: ConceptId, afterLearning: boolean): string {
  const concept = getConcept(conceptId)
  if (afterLearning) {
    return [
      `You are Claude. The student just went through a short predict→reveal→reflect exchange about ${concept.descriptors.title} — specifically XeF2 (5 domains, 3 lone pairs) and the broader 5-domain row of her chart.`,
      '',
      "She now sees that the three lone pairs sit in the equatorial plane (more space, fewer 90° neighbors), leaving the two axial positions for the F atoms — which is why the molecule is linear. She also saw the same logic extend to T-shape (2 lone pairs) and would extend to see-saw (1 lone pair).",
      '',
      "Now you're closing the loop in chat: a warm, peer-level follow-up that picks up where the artifact ended. It should:",
      '  1. Open with a short bridging line — something like "happy to keep going" — without quoting the artifact verbatim.',
      "  2. Offer to look at any other row of her chart that's confusing (e.g. 6 domains, or the bent shapes that often trip people up), OR any specific molecule she's stuck on. Frame it as an open invitation, not a list.",
      '  3. Two to three short sentences total. No headings, no bullets, no code.',
      '',
      "Tone: jovial, knowledgeable friend. Plainspoken. No tutoring. No \"great work!\" or scoring. Don't re-explain the concept the artifact already covered. Do not emit any custom tags.",
    ].join('\n')
  }
  return [
    `You are Claude. The student asked about XeF2 — 5 electron domains, 3 lone pairs, molecular geometry linear, electron-domain geometry trigonal bipyramidal. She attached a VSEPR chart and her Lewis drawing. The underlying concept is ${concept.descriptors.title}.`,
    '',
    "She has chosen to skip the visual walkthrough and just get the answer. Give it to her — friendly, brief, no scolding, no second offer. Reference what you can see in her attachments so she knows you're grounded in her materials.",
    '',
    'Your response should:',
    '  1. Honor the ask — answer directly. The five electron domains around Xe arrange as a trigonal bipyramid: three equatorial positions in a flat triangle around the central atom and two axial positions above and below. Lone pairs take more space than bonded pairs, so they claim the roomier equatorial seats (each equatorial position only has two neighbors at 90°, axial positions have three). With three lone pairs equatorial, the two F atoms end up axial — directly above and below Xe, 180° apart. That is why the molecular geometry reads as linear even though the electron-domain geometry is trigonal bipyramidal. Her intuition that the lone pairs are "blocking" is half-right: they are claiming the equatorial seats, leaving only the axial axis for the F\'s.',
    '  2. Optionally add one short follow-up sentence inviting her to ask about a specific molecule or another row of the chart. No second offer of the visual walkthrough.',
    '  3. Four to six short sentences total. Plain prose. No headings, no bullets, no code.',
    '',
    "Tone: warm, peer-level, jovial knowledgeable friend who remembers taking chemistry. Not a tutor. No \"of course!\" or \"great question!\". Do not emit any custom tags. No lecturing.",
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    messages: IncomingMessage[]
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
