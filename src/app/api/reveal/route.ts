import Anthropic from '@anthropic-ai/sdk'
import { ENVELOPE_CONTENT_TYPE, EnvelopeEncoder } from '@/lib/protocol'
import { getConcept, type Concept, type ConceptId } from '@/lib/concepts'

// The reveal beat: streams a 3-paragraph response that honors the user's
// prediction, names the related concept their guess near-missed (if any),
// and closes the loop back to their original wrapper task. See KICKOFF DoD
// "The reveal honors the user's prediction before correcting; explicitly
// names the related concept the prediction near-missed; closes the loop
// back to the original task."

const apiKey = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

type PredictionPayload = {
  optionId?: string
  freeText?: string
  misconceptionTag?: 'allSettled' | 'default-timeout' | 'truth'
  /** Label of the multiple-choice option, when one was picked. */
  predictionLabel?: string
}

function revealSystemPrompt(concept: Concept, prediction: PredictionPayload): string {
  const tagGuidance: Record<string, string> = {
    truth:
      "The user picked the correct answer — Promise.all is all-or-nothing. Honor that explicitly (something like \"yep, that's the shape of it\") and then go a step deeper into why, before connecting back to the wrapper task.",
    allSettled:
      "The user's prediction maps to how Promise.allSettled behaves. Name Promise.allSettled explicitly in your response — something like \"what you described is exactly how Promise.allSettled works, but Promise.all is different.\" Be warm about it; allSettled is the sibling that does what they expected.",
    'default-timeout':
      "The user assumed JavaScript has some built-in default timeout on Promise.all (or on promises themselves). It doesn't — promises never expire on their own. Be gentle: it's a reasonable assumption from someone used to HTTP clients or async libraries that DO time out. Name the assumption explicitly so they can correct it.",
  }

  const predictionBlock = (() => {
    if (prediction.optionId && prediction.misconceptionTag) {
      return [
        `The user picked: "${prediction.predictionLabel ?? prediction.optionId}"`,
        `Misconception shape: ${prediction.misconceptionTag}`,
        '',
        tagGuidance[prediction.misconceptionTag] ?? '',
      ].join('\n')
    }
    if (prediction.freeText) {
      return [
        `The user wrote in their own words: "${prediction.freeText}"`,
        '',
        'Read their answer carefully. If it lines up with one of these shapes, NAME that concept explicitly in your honor-the-prediction paragraph:',
        '  • Maps to Promise.allSettled (resolves with whatever finished, marks the rest).',
        '  • Maps to a built-in-timeout assumption (waits some time, then throws).',
        '  • Lines up with the truth (all-or-nothing — hangs forever too).',
        "If it doesn't fit any of those cleanly, write an implicit reveal that meets them where they are.",
      ].join('\n')
    }
    return 'The user skipped the prediction. Just deliver the reveal cleanly without referencing what they predicted.'
  })()

  return [
    `You are Claude, walking a programmer through what happens when a promise inside Promise.all never settles.`,
    '',
    `CONCEPT: ${concept.descriptors.title}`,
    '',
    'USER PREDICTION:',
    predictionBlock,
    '',
    'Your response is the reveal beat. Three short paragraphs, in this exact order — do not skip the first paragraph:',
    '  1. (MANDATORY OPENING) HONOR their prediction. Your FIRST sentence must speak to what they predicted. If their prediction maps to a related concept, NAME it in this paragraph (e.g., "your guess maps to how Promise.allSettled behaves" or "the instinct that there\'d be a built-in timeout is reasonable — JavaScript just doesn\'t actually do that"). No "actually" or "well actually" — meet them where they are. Even if they got it right, this paragraph still exists: confirm their read first.',
    '  2. STATE WHAT ACTUALLY HAPPENS. Promise.all is all-or-nothing: while one inner promise never settles, the whole Promise.all never settles. The two that finished don\'t matter — Promise.all is still waiting on the third. There\'s nothing to throw and nothing to catch yet.',
    "  3. CLOSE THE LOOP back to their original task. A bare try/catch around Promise.all wouldn't help — a hung promise never rejects, so there's nothing to catch. The fix is to give the hung request a way to FAIL: an AbortController paired with a timeout, or Promise.race against a timer. The try/catch wraps THAT.",
    '',
    'Tone: warm, peer-level, plainspoken. No headings. No code blocks (a quick inline mention of `try/catch` or `AbortController` is fine). About three short paragraphs. Do NOT preview the reflection beat or suggest they "let me know if you want…" — the next beat will introduce itself.',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 501 })
  }

  const body = (await req.json()) as {
    conceptId: ConceptId
    prediction: PredictionPayload
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  const { conceptId, prediction, messages = [] } = body
  const concept = getConcept(conceptId)
  const client = new Anthropic({ apiKey })

  // If no upstream conversation context is passed, anchor the call with a
  // single nudge so the model has a user turn to respond to.
  const apiMessages =
    messages.length > 0
      ? messages
      : [{ role: 'user' as const, content: 'Deliver the reveal beat now.' }]

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const envelope = new EnvelopeEncoder(controller)
      envelope.meta({ isArc: false, conceptId })

      try {
        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 2048,
          system: revealSystemPrompt(concept, prediction),
          messages: apiMessages,
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
