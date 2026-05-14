/**
 * Concept registry — shared substrate for the affordance arc.
 *
 * Each Concept carries:
 *  - triggerCriteria: prose handed to the server-side classifier so it can
 *    decide whether an incoming user message belongs to this concept.
 *  - descriptors.title: canonical concept title. Card, map, and workshop all
 *    pull this exact string so framing never drifts.
 *  - descriptors.fallback.*: full text for each beat used as
 *      (a) identity descriptors downstream surfaces reuse, and
 *      (b) the degrade-safe content if a beat endpoint fails after retries.
 *  - descriptors.cache: structural slot for future per-concept workshop
 *    caching (currently empty; kept here so the substrate's direction is
 *    legible to a reviewer).
 *
 * For the prototype the registry has a single entry. Adding a concept = adding
 * a new Concept object below and writing its fallback descriptors.
 */

/**
 * Concept ids are the parent concept, not a specific failure-mode under it.
 * "Promise.all" rolls up the family of behaviors (hang, fail-fast, all-resolve,
 * staggered reject) that the workshop's presets span. The trigger criteria
 * here is still a specific entry point — the user is hitting the hang case —
 * but the concept node on the map and the card title both read as the parent.
 * Otherwise the map fills up with one node per micro-behavior and we have to
 * generate a workshop per leaf, which doesn't scale.
 */
export type ConceptId = 'promise-all'

export type PredictionOption = {
  id: string
  label: string
  isCorrect: boolean
  /** Tag describing the shape of the misconception, used by /api/reveal to name the near-miss. */
  misconceptionTag?: 'allSettled' | 'default-timeout' | 'truth'
}

export type GhostNode = {
  id: string
  label: string
  hint: string
}

export type ConceptDescriptor = {
  /** Canonical concept title — single source of truth for card/map/workshop. */
  title: string
  fallback: {
    affordance: {
      intro: string
      cta: { wrapper: string; learn: string }
    }
    predictionOptions: {
      framing: string
      options: PredictionOption[]
    }
    reveal: string
    reflectionFraming: string
    cardMeta: {
      conceptTitle: string
      framing: string
    }
    ghostNodes: GhostNode[]
    workshopOpening: {
      framing: string
      options: PredictionOption[]
    }
    /** Stand-in body for the γ.2 wrapper path. Real generation lives in /api/wrapper-response. */
    wrapperResponse: string
  }
  /**
   * Structural slot for future per-concept caching of generated workshop
   * content. Empty for now — gestured at, not built. (See KICKOFF "Future
   * direction hints" → workshop caching.)
   */
  cache?: {
    workshop?: unknown
  }
}

export type Concept = {
  id: ConceptId
  triggerCriteria: string
  descriptors: ConceptDescriptor
}

const PROMISE_ALL: Concept = {
  id: 'promise-all',
  triggerCriteria: [
    'The user is hitting (or describing) the failure mode where Promise.all',
    'never settles because at least one promise inside it never resolves or',
    'rejects — for example an HTTP request that hangs forever with no timeout.',
    'Signals: "Promise.all hangs", "never resolves", "never returns", "locks',
    'up the request", "wraps fetches in Promise.all and it hangs", or a user',
    'asking how to make it not hang. Naïve try/catch wrapping does NOT fix',
    'this — that is part of the conceptual gap.',
  ].join(' '),
  descriptors: {
    title: 'Promise.all',
    fallback: {
      affordance: {
        intro:
          "Before I write the wrapper — there's a thing happening with Promise.all here that the try/catch alone won't fix. Want to think it through first, or should I just write the wrapper?",
        cta: {
          wrapper: 'Just write the wrapper',
          learn: 'Think it through first · ~90s',
        },
      },
      predictionOptions: {
        framing:
          "Quick check before we dig in: you've got three fetch calls inside `Promise.all(...)`. One of them never comes back — the server just hangs. What does `Promise.all` do?",
        options: [
          {
            id: 'allSettled',
            label:
              'It resolves with whatever finished, and marks the hung one as pending or failed.',
            isCorrect: false,
            misconceptionTag: 'allSettled',
          },
          {
            id: 'timeout',
            label:
              "It waits some default amount of time and then throws so your code doesn't hang forever.",
            isCorrect: false,
            misconceptionTag: 'default-timeout',
          },
          {
            id: 'hang',
            label:
              'It hangs forever too. Until that one promise settles, the whole `Promise.all` is stuck.',
            isCorrect: true,
            misconceptionTag: 'truth',
          },
        ],
      },
      reveal: [
        "Promise.all is all-or-nothing. It waits for every promise in the array to settle —",
        'either resolve or reject — before it does anything. If one of them never settles, the',
        "Promise.all itself never settles. The other two fetches might have come back ages ago;",
        "you'd never know, because Promise.all is still waiting on the third.",
        '\n\nThat\'s why a plain `try/catch` around it doesn\'t help: there\'s nothing to catch yet.',
        "The promise hasn't rejected — it's just sitting there. To get out of that wait, you have",
        'to give the underlying request a way to fail — an `AbortController` with a timeout, or a',
        '`Promise.race` against a timer. The `try/catch` wraps *that*.',
      ].join(' '),
      reflectionFraming:
        "Anything you want to keep from that? Maybe the all-or-nothing shape, or that try/catch needed something to catch — or something else that stuck.",
      cardMeta: {
        conceptTitle: 'Promise.all',
        framing: 'Got it. Kept this for you:',
      },
      ghostNodes: [
        // First four are the "cardinal" ghosts (long rays in the spark shape) —
        // the most direct neighbors. The two below are the "diagonal" ghosts
        // (shorter rays) — supporting context that rounds out the neighborhood.
        {
          id: 'allSettled',
          label: 'Promise.allSettled',
          hint: 'The sibling that actually behaves the way you first guessed — returns a result for each promise, settled or not.',
        },
        {
          id: 'race',
          label: 'Promise.race',
          hint: 'Settles as soon as the first promise does. Useful for racing a request against a timeout.',
        },
        {
          id: 'abort',
          label: 'AbortController',
          hint: 'How you make a hung fetch actually fail. Pair it with a timer to give Promise.all something to settle on.',
        },
        {
          id: 'unhandled',
          label: 'Unhandled rejections',
          hint: "The flip side of all-or-nothing: if one promise rejects and you don't catch it, Promise.all rejects immediately and the others keep running in the background.",
        },
        {
          id: 'any',
          label: 'Promise.any',
          hint: 'The third sibling — settles on the first SUCCESS, ignoring rejections until everything fails.',
        },
        {
          id: 'tryCatch',
          label: 'try/catch with promises',
          hint: "Why your original instinct didn't help here — try/catch only fires when there's something to catch, and a hung promise never throws.",
        },
      ],
      workshopOpening: {
        framing:
          "Same question as before, but now you're watching. Two of these resolve at 200ms. The third never comes back. What happens to the aggregate timeline?",
        // Same answer space as the chat-side predict beat — reusing the option set
        // is deliberate (see KICKOFF: "Same answer space as chat prediction, framed visually").
        options: [
          {
            id: 'allSettled',
            label: 'The aggregate resolves at 200ms with two values; the hung one is marked.',
            isCorrect: false,
            misconceptionTag: 'allSettled',
          },
          {
            id: 'timeout',
            label: 'The aggregate waits, then bails with a timeout error.',
            isCorrect: false,
            misconceptionTag: 'default-timeout',
          },
          {
            id: 'hang',
            label: "The aggregate keeps waiting. Forever, unless something forces the third to settle.",
            isCorrect: true,
            misconceptionTag: 'truth',
          },
        ],
      },
      wrapperResponse: [
        "Sure — here's the wrapper, but with a small twist: a bare `try/catch` around `Promise.all` won't actually",
        "save you here, because a hanging promise never throws. You need to give the request a way to fail. So the",
        'wrapper has a timeout inside it:',
        '\n\n```ts',
        'async function safeAll<T>(',
        '  promises: Promise<T>[],',
        '  timeoutMs = 10_000,',
        '): Promise<T[]> {',
        '  const controller = new AbortController()',
        '  const timer = setTimeout(() => controller.abort(), timeoutMs)',
        '  try {',
        '    return await Promise.all(',
        '      promises.map((p) =>',
        '        Promise.race([',
        '          p,',
        '          new Promise<T>((_, reject) => {',
        "            controller.signal.addEventListener('abort', () =>",
        "              reject(new Error('Request timed out')),",
        '            )',
        '          }),',
        '        ]),',
        '      ),',
        '    )',
        '  } finally {',
        '    clearTimeout(timer)',
        '  }',
        '}',
        '```',
        "\n\nNow if one of your fetches hangs, the controller fires after `timeoutMs`, that promise rejects, and the",
        '`try/catch` around `safeAll(...)` actually has something to catch. Drop your three fetches into it and you',
        "should be unstuck.",
      ].join(' '),
    },
  },
}

export const CONCEPTS: readonly Concept[] = [PROMISE_ALL] as const

/**
 * Canonical trigger message pre-populated in /new's composer. Plain language,
 * no code paste — see KICKOFF "Trigger message" decision.
 */
export const TRIGGER_MESSAGE =
  "my Promise.all keeps hanging when one of these api calls doesn't come back. can you wrap it in try/catch so it doesn't lock up the whole request?"

export function getConcept(id: ConceptId): Concept {
  const c = CONCEPTS.find((x) => x.id === id)
  if (!c) throw new Error(`Unknown concept id: ${id}`)
  return c
}

/**
 * Cheap client-side trigger detector. Used only as a connectivity backstop —
 * if /api/chat is unreachable after retries, the client can still set arc
 * state locally for the canonical trigger text. See KICKOFF "Resilience".
 */
export function clientMatchTrigger(text: string): ConceptId | null {
  const lower = text.toLowerCase()
  const hitsPromiseAll = lower.includes('promise.all') || lower.includes('promise all')
  const hitsHangSignal =
    lower.includes('hang') ||
    lower.includes("doesn't come back") ||
    lower.includes('never resolves') ||
    lower.includes('never returns') ||
    lower.includes('locks up')
  if (hitsPromiseAll && hitsHangSignal) return 'promise-all'
  return null
}
