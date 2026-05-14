import type { Message } from './types'
import { CANNED_RESPONSE, DEFAULT_CONFIG } from './seed'
import { parseEnvelope } from './protocol'

export type Model = {
  id: string
  label: string
}

export const MODELS: Model[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
]

export const DEFAULT_MODEL = MODELS[1]

/**
 * Meta emitted on the first event of /api/chat. When the server-side
 * classifier (Task 2) decides a message belongs to a registered concept,
 * `isArc` flips true and the rest of the meta payload (conceptId, descriptors,
 * reasoning) rides along. For Task 1 the server always emits isArc: false.
 */
export type ChatMeta = {
  isArc: boolean
  conceptId?: string
  reasoning?: string
  // Forward-compat: server may attach concept descriptors here so clients can
  // hydrate downstream surfaces without a second round-trip.
  descriptors?: Record<string, unknown>
}

export type StreamChatResult = {
  text: string
  meta: ChatMeta
}

export type StreamFromEndpointOptions = {
  onDelta: (delta: string) => void
  onMeta?: (meta: ChatMeta) => void
  signal?: AbortSignal
}

/**
 * Generic NDJSON-envelope client. Fetches an endpoint, parses the envelope,
 * and surfaces text deltas + meta to the caller. Resolves with the full
 * accumulated text and the parsed meta.
 *
 * Falls back to a simulated canned response when the server returns 501
 * (no API key configured) — keeps the scaffold runnable out of the box.
 */
export async function streamFromEndpoint(
  endpoint: string,
  body: unknown,
  { onDelta, onMeta, signal }: StreamFromEndpointOptions,
): Promise<StreamChatResult> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 501) {
    const text = await simulate(onDelta, signal)
    const meta: ChatMeta = { isArc: false }
    onMeta?.(meta)
    return { text, meta }
  }

  if (!res.ok || !res.body) {
    throw new Error(`${endpoint} failed: ${res.status}`)
  }

  let full = ''
  let meta: ChatMeta = { isArc: false }
  let metaSeen = false

  await parseEnvelope(res.body, {
    onMeta: (data) => {
      meta = data as ChatMeta
      metaSeen = true
      onMeta?.(meta)
    },
    onText: (delta) => {
      full += delta
      onDelta(delta)
    },
    onError: (message) => {
      // Surface upstream failures as a thrown Error — the chat store handles
      // these the same way as a network reject (commits partial buffer).
      throw new Error(message)
    },
  })

  // Defensive: if the server skipped meta, callers still get a sane default.
  if (!metaSeen) onMeta?.(meta)

  return { text: full, meta }
}

/**
 * Convenience wrapper for the normal-chat path: builds the /api/chat request
 * body from message history + model, then delegates to streamFromEndpoint.
 */
export function streamChat(
  history: Message[],
  model: Model,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  onMeta?: (meta: ChatMeta) => void,
): Promise<StreamChatResult> {
  return streamFromEndpoint(
    '/api/chat',
    {
      model: model.id,
      messages: history.map((m) => ({ role: m.role, content: m.text })),
    },
    { onDelta, onMeta, signal },
  )
}

async function simulate(onDelta: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
  await delay(DEFAULT_CONFIG.thinkingDelay, signal)

  let full = ''
  for (const char of CANNED_RESPONSE) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    full += char
    onDelta(char)
    await delay(DEFAULT_CONFIG.streamSpeed)
  }
  return full
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}
