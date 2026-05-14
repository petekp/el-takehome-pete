/**
 * NDJSON envelope used by every beat endpoint.
 *
 * One JSON object per line over a regular HTTP stream. The first event is
 * always `meta`; then `text` (for streaming endpoints) or `data` (for
 * structured beats); `done` last. `error` and `reasoning` are reserved for
 * later use (dev mode reasoning, retry-aware error surfacing).
 *
 * Wire format example:
 *   {"event":"meta","data":{"isArc":false}}\n
 *   {"event":"text","delta":"Hello"}\n
 *   {"event":"text","delta":", world"}\n
 *   {"event":"done"}\n
 */

export type EnvelopeMeta = { event: 'meta'; data: Record<string, unknown> }
export type EnvelopeText = { event: 'text'; delta: string }
export type EnvelopeData = { event: 'data'; data: Record<string, unknown> }
export type EnvelopeDone = { event: 'done' }
export type EnvelopeError = { event: 'error'; message: string; retryable?: boolean }
export type EnvelopeReasoning = { event: 'reasoning'; data: Record<string, unknown> }

export type EnvelopeEvent =
  | EnvelopeMeta
  | EnvelopeText
  | EnvelopeData
  | EnvelopeDone
  | EnvelopeError
  | EnvelopeReasoning

export const ENVELOPE_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8'

/**
 * Server-side encoder. Wraps a ReadableStreamDefaultController and writes
 * one JSON line per event. `done()` emits the terminal event and closes.
 */
export class EnvelopeEncoder {
  private readonly textEncoder = new TextEncoder()
  private closed = false

  constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  meta(data: Record<string, unknown>) {
    this.write({ event: 'meta', data })
  }

  text(delta: string) {
    this.write({ event: 'text', delta })
  }

  data(data: Record<string, unknown>) {
    this.write({ event: 'data', data })
  }

  reasoning(data: Record<string, unknown>) {
    this.write({ event: 'reasoning', data })
  }

  error(message: string, retryable?: boolean) {
    this.write({ event: 'error', message, ...(retryable !== undefined ? { retryable } : {}) })
  }

  done() {
    if (this.closed) return
    this.write({ event: 'done' })
    this.controller.close()
    this.closed = true
  }

  private write(event: EnvelopeEvent) {
    if (this.closed) return
    this.controller.enqueue(this.textEncoder.encode(JSON.stringify(event) + '\n'))
  }
}

export type EnvelopeHandlers = {
  onMeta?: (data: Record<string, unknown>) => void
  onText?: (delta: string) => void
  onData?: (data: Record<string, unknown>) => void
  onReasoning?: (data: Record<string, unknown>) => void
  onError?: (message: string, retryable: boolean) => void
  /** Called once when the `done` event is observed. */
  onDone?: () => void
}

/**
 * Client-side parser. Line-buffers a ReadableStream of UTF-8 bytes and
 * dispatches each parsed JSON line to the appropriate handler.
 *
 * Resolves when the stream ends. A malformed line is forwarded to onError
 * (non-retryable) rather than throwing — protocol corruption shouldn't crash
 * the host page.
 */
export async function parseEnvelope(
  body: ReadableStream<Uint8Array>,
  handlers: EnvelopeHandlers,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        // Flush any trailing partial line — be lenient if the server didn't terminate cleanly.
        if (buffer.trim().length > 0) dispatch(buffer, handlers)
        return
      }
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim().length > 0) dispatch(line, handlers)
        newline = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function dispatch(line: string, handlers: EnvelopeHandlers) {
  let event: EnvelopeEvent
  try {
    event = JSON.parse(line) as EnvelopeEvent
  } catch {
    handlers.onError?.(`Malformed envelope line: ${line.slice(0, 80)}`, false)
    return
  }
  switch (event.event) {
    case 'meta':
      handlers.onMeta?.(event.data)
      break
    case 'text':
      handlers.onText?.(event.delta)
      break
    case 'data':
      handlers.onData?.(event.data)
      break
    case 'reasoning':
      handlers.onReasoning?.(event.data)
      break
    case 'error':
      handlers.onError?.(event.message, event.retryable ?? false)
      break
    case 'done':
      handlers.onDone?.()
      break
  }
}
