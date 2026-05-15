import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type ConceptId } from '@/lib/concepts'
import type {
  ArtifactInteractionSummary,
  PredictionSummary,
} from '@/lib/artifact-interaction'

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

function latestUserMessage(messages: IncomingMessage[]): IncomingMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'user') return message
  }
  return null
}

/**
 * Hint lines describing the most recallable moments from her artifact session.
 * These get spliced into the afterLearning system prompt so the follow-up
 * can land like a friend recalling a shared moment, not a recap of telemetry.
 *
 * Generated as one short past-tense observation per signal. The prompt then
 * tells Claude to use AT MOST ONE of them — never enumerate.
 */
function describePrediction1(p: PredictionSummary): string | null {
  switch (p.bucket) {
    case 'equatorial':
      return 'On the why-equatorial question she picked the right answer — the equatorial seats have more room (fewer 90° neighbors).'
    case 'blocking':
      return 'On the why-equatorial question she stayed on her "blocking" framing — that intuition got bridged into the spatial story rather than corrected.'
    case 'atoms-push':
      return 'On the why-equatorial question she thought the F atoms push the lone pairs out — the relationship was actually the reverse.'
    case 'counting':
      return 'On the why-equatorial question she answered the counting/octet side instead of the spatial side.'
    case 'notational':
      return 'On the why-equatorial question she thought the equatorial placement was a 2D drawing convention.'
    case 'idk':
      return 'She passed on the why-equatorial prediction with an "I don\'t know" — no commitment to a wrong model, just unfamiliarity.'
    case 'unclassified':
      return p.freeText
        ? `On the why-equatorial question she wrote: "${p.freeText.slice(0, 200)}".`
        : null
    default:
      return null
  }
}

function describePrediction2(p: PredictionSummary): string | null {
  switch (p.bucket) {
    case 'tshape':
      return 'On the 5-domains / 2-lone-pairs prediction she got T-shape right.'
    case 'linear':
      return 'On the 5-domains / 2-lone-pairs prediction she guessed linear — the "lone-pair count changes the shape" idea hadn\'t fully clicked yet, but the reveal addressed it.'
    case 'pyramidal':
      return 'On the 5-domains / 2-lone-pairs prediction she guessed trigonal pyramidal — that\'s a 4-domain shape, not a 5-domain shape.'
    case 'unclassified':
      return p.freeText
        ? `On the 5-domains / 2-lone-pairs prediction she wrote: "${p.freeText.slice(0, 200)}".`
        : null
    default:
      return null
  }
}

function describeInteractions(s: ArtifactInteractionSummary): string[] {
  const lines: string[] = []
  if (s.prediction1) {
    const l = describePrediction1(s.prediction1)
    if (l) lines.push(l)
  }
  if (s.prediction2) {
    const l = describePrediction2(s.prediction2)
    if (l) lines.push(l)
  }
  if (!s.completedFullArc) {
    lines.push('She closed the artifact before reaching the closing synthesis — treat the follow-up as picking up mid-thread rather than wrapping up.')
  }
  if (s.manuallyRotated) {
    lines.push('She rotated the 3D molecule herself to look at the geometry from different angles.')
  }
  if (s.timeInArtifactSec > 0 && s.timeInArtifactSec < 25) {
    lines.push('She moved through the artifact quickly (under ~25 seconds) — likely scanned more than dwelled.')
  }
  return lines
}

function wrapperSystemPrompt(
  conceptId: ConceptId,
  afterLearning: boolean,
  artifactInteraction?: ArtifactInteractionSummary,
): string {
  const concept = getConcept(conceptId)
  if (afterLearning) {
    const interactionLines = artifactInteraction ? describeInteractions(artifactInteraction) : []
    const sections: string[] = [
      `You are Claude. The student just went through a short predict→reveal→reflect exchange about ${concept.descriptors.title} — specifically XeF2 (5 domains, 3 lone pairs) and the broader 5-domain row of her chart.`,
      "She now sees that the three lone pairs sit in the equatorial plane (more space, fewer 90° neighbors), leaving the two axial positions for the F atoms — which is why the molecule is linear. She also saw the same logic extend to T-shape (2 lone pairs) and would extend to see-saw (1 lone pair).",
    ]
    const hasCues = interactionLines.length > 0
    if (hasCues) {
      sections.push(
        [
          'WHAT SHE JUST DID INSIDE THE ARTIFACT (your memory of the session — NOT data to recite):',
          ...interactionLines.map((l) => `  - ${l}`),
          '',
          'How to use these cues:',
          '  - These are the most concrete thing you know about her right now. Lean on them: a follow-up that lands one short, specific callback feels like a friend who was actually there. A follow-up with no callback feels generic.',
          '  - Pick ONE moment that lands cleanly and weave it into the bridging line. Phrase it in your own words; do NOT quote the cue text or the prediction option labels verbatim.',
          '  - Never enumerate. Never read multiple cues back. Never use phrases like "I saw you..." or "you did X then Y" — those sound like a log.',
          '  - Do not grade or score. No "great job" / "nice work" / "you got that one right".',
          '  - If she got a prediction wrong, the reveal already addressed it — do NOT re-correct it here. Just acknowledge the moment lightly and move on.',
          '  - Only skip the callback entirely if NONE of the cues can be referenced without sounding clinical.',
        ].join('\n'),
      )
    }
    const bridgingLine = hasCues
      ? '  1. Open with a short bridging line that lands the one callback you chose (from the cues above), in your own words. Make it feel like a friend continuing a conversation, not a recap.'
      : '  1. Open with a short bridging line — something like "happy to keep going" — without quoting the artifact verbatim.'
    sections.push(
      [
        "Now you're closing the loop in chat: a warm, peer-level follow-up that picks up where the artifact ended. It should:",
        bridgingLine,
        "  2. Offer to look at any other row of her chart that's confusing (e.g. 6 domains, or the bent shapes that often trip people up), OR any specific molecule she's stuck on. Frame it as an open invitation, not a list.",
        '  3. Two to three short sentences total. No headings, no bullets, no code.',
      ].join('\n'),
      "Tone: jovial, knowledgeable friend. Plainspoken. No tutoring. No \"great work!\" or scoring. Don't re-explain the concept the artifact already covered. Do not emit any custom tags.",
    )
    return sections.join('\n\n')
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

function fallbackWrapperText(
  conceptId: ConceptId,
  afterLearning: boolean,
  artifactInteraction?: ArtifactInteractionSummary | null,
): string {
  const concept = getConcept(conceptId)
  if (afterLearning) {
    const firstPrediction = artifactInteraction?.prediction1?.bucket
    const callback =
      firstPrediction === 'equatorial'
        ? 'The piece you leaned into there is the key one: the equatorial seats give the lone pairs more room.'
        : firstPrediction
          ? 'That spatial move is the heart of it: the lone pairs are not just counted, they have to sit somewhere in 3D.'
          : `That walkthrough was meant to make ${concept.descriptors.title.toLowerCase()} feel spatial instead of like a chart rule.`

    return [
      callback,
      "If another row on your chart still feels slippery, send me the molecule or the row and we'll walk through it the same way.",
    ].join(' ')
  }

  return [
    'The five electron domains around Xe arrange as a trigonal bipyramid.',
    'Lone pairs take more room than bonded pairs, so the three lone pairs claim the roomier equatorial seats, where each has fewer 90-degree neighbors.',
    "That leaves the two F atoms in the axial positions, directly opposite each other, which is why the molecular geometry is linear even though the electron-domain geometry is trigonal bipyramidal.",
    'Your “blocking” intuition is half-right: the lone pairs are claiming space, but they are doing it in 3D rather than simply blocking bonds in the flat Lewis drawing.',
  ].join(' ')
}

function fallbackWrapperResponse(
  conceptId: ConceptId,
  afterLearning: boolean,
  artifactInteraction?: ArtifactInteractionSummary | null,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      envelope.meta({ isArc: false, conceptId })
      envelope.text(fallbackWrapperText(conceptId, afterLearning, artifactInteraction))
      envelope.done()
    },
  })

  return new Response(stream, { headers: STREAM_HEADERS })
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    conceptId: ConceptId
    messages: IncomingMessage[]
    afterLearning?: boolean
    artifactInteraction?: ArtifactInteractionSummary | null
  }
  const {
    conceptId,
    messages,
    afterLearning = false,
    artifactInteraction,
  } = body

  if (!apiKey) {
    return fallbackWrapperResponse(
      conceptId,
      afterLearning,
      artifactInteraction,
    )
  }

  const client = new Anthropic({ apiKey })
  const latestUser = latestUserMessage(messages)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      // Meta is non-arc — arc state is already set client-side; this endpoint
      // just streams the response.
      envelope.meta({ isArc: false, conceptId })

      try {
        if (!latestUser) {
          throw new Error('/api/wrapper-response requires at least one user message')
        }

        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system: wrapperSystemPrompt(
            conceptId,
            afterLearning,
            artifactInteraction ?? undefined,
          ),
          // Button clicks do not add a fresh user turn, so the chat history can
          // end with Claude's affordance message. Sonnet 4.6 rejects that as an
          // assistant prefill; this completion only needs the latest student
          // turn and its attachments as grounding context.
          messages: [latestUser],
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
    headers: STREAM_HEADERS,
  })
}
