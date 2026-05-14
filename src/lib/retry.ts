/**
 * Exponential-backoff retry helper. Used by every beat endpoint per KICKOFF
 * "Resilience patterns": 3 retries default, retryable = network / 5xx / 429.
 */

export type BackoffOptions = {
  /** Total attempts is retries + 1 (1 initial attempt + N retries). */
  retries?: number
  /** Initial delay in ms; doubled each retry. */
  baseMs?: number
  /** Decide whether an error should be retried. */
  isRetryable?: (err: unknown) => boolean
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3
  const baseMs = options.baseMs ?? 500
  const isRetryable = options.isRetryable ?? defaultRetryable

  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      if (attempt > retries || !isRetryable(err)) throw err
      const delay = baseMs * Math.pow(2, attempt - 1)
      await sleep(delay)
    }
  }
}

function defaultRetryable(err: unknown): boolean {
  // Anthropic SDK errors expose .status; Node fetch errors have a code; the
  // rest we treat as transient unless they're clearly client-side (400/401/403/404/422).
  const status = getStatus(err)
  if (status === undefined) return true
  if (status === 429) return true
  if (status >= 500 && status < 600) return true
  return false
}

function getStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const status = (err as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
