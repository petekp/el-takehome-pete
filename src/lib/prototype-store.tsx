'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CONCEPTS,
  getConcept,
  type ConceptId,
  type GhostNode,
  type PredictionOption,
} from './concepts'
import { useChatStore } from './chat-store'
import { parseEnvelope } from './protocol'

/**
 * State umbrella for the affordance arc. Sits alongside ChatStore (composed
 * under ChatProvider) so the arc's own concerns — beat progression, side
 * panel, the concept being explored — don't leak into the generic chat layer.
 *
 * Persisted to localStorage under STORAGE_KEY. /new resets the arc to its
 * idle state (see resetArc) so each fresh demo run starts clean.
 */

/**
 * The path the user takes after the affordance is offered.
 *  - 'wrapper': the literal ask was honored — γ.2 wrapper response.
 *  - 'learning': the user opted into the structured exchange.
 */
export type ArcPath = 'wrapper' | 'learning'

export type ArcBeat =
  | 'idle' // no trigger fired
  | 'choosing' // affordance shown; waiting for path selection
  | 'wrapper-response' // wrapper path streaming/complete
  | 'predicting' // prediction options shown
  | 'revealing' // reveal streaming
  | 'reflecting' // reflection prompt active
  | 'card-ready' // inline card committed; arc complete inside chat
  | 'map-open' // side panel open with map view
  | 'workshop-open' // side panel switched to workshop
  | 'exchange-ended' // user hit End during the structured exchange — choice pill stays visible, downstream beats suppressed

export type Prediction = {
  /** Set when the user picked a multiple-choice option. */
  optionId?: string
  /** Set when the user typed free-text. */
  freeText?: string
}

export type SidePanelView = 'map' | 'workshop'

export type ArcState = {
  beat: ArcBeat
  path: ArcPath | null
  conceptId: ConceptId | null
  /** Which chat the arc is anchored to. */
  chatId: string | null
  /** User message that fired the arc. */
  triggerMessageId: string | null
  /** Assistant message that hosts the affordance buttons. */
  affordanceMessageId: string | null
  prediction: Prediction | null
  /** API-generated prediction beat content. Falls back to concept registry when null. */
  predictionOptions: { framing: string; options: PredictionOption[] } | null
  reveal: { text: string } | null
  /** API-generated reflection framing line. Falls back to concept registry when null. */
  reflectionFraming: string | null
  reflection: { text: string } | null
  /** API-generated card metadata (framing + verbatim concept title). Falls back to concept registry when null. */
  cardMeta: { framing: string; conceptTitle: string } | null
  /** API-generated ghost node labels + hints for the map. Falls back to concept registry when null. */
  ghostNodes: GhostNode[] | null
  /** API-generated workshop opening framing. Falls back to concept registry when null. */
  workshopOpening: { framing: string } | null
}

export type SidePanelState = {
  open: boolean
  view: SidePanelView
}

export type PrototypeState = {
  arc: ArcState
  sidePanel: SidePanelState
}

const EMPTY_ARC: ArcState = {
  beat: 'idle',
  path: null,
  conceptId: null,
  chatId: null,
  triggerMessageId: null,
  affordanceMessageId: null,
  prediction: null,
  predictionOptions: null,
  reveal: null,
  reflectionFraming: null,
  reflection: null,
  cardMeta: null,
  ghostNodes: null,
  workshopOpening: null,
}

const EMPTY_SIDE_PANEL: SidePanelState = {
  open: false,
  view: 'map',
}

const INITIAL_STATE: PrototypeState = {
  arc: EMPTY_ARC,
  sidePanel: EMPTY_SIDE_PANEL,
}

const STORAGE_KEY = 'education-labs:prototype-state'

export type FireArcInput = {
  conceptId: ConceptId
  chatId: string
  triggerMessageId: string
  affordanceMessageId?: string
}

export type PrototypeStore = {
  state: PrototypeState

  // Lifecycle ---------------------------------------------------------------
  /** Reset the arc to idle. Called on /new mount and on demand. */
  resetArc: () => void

  // Arc transitions ---------------------------------------------------------
  /** Arc-firing meta arrived from /api/chat. Move from idle → choosing. */
  fireArc: (input: FireArcInput) => void
  /** User picked "Just write the wrapper". */
  chooseWrapper: () => void
  /** User picked "Think it through first". */
  chooseLearn: () => void
  recordPrediction: (prediction: Prediction) => void
  recordReveal: (reveal: { text: string }) => void
  recordReflection: (reflection: { text: string }) => void
  /** Inline card is committed in chat; we're waiting for the user to click Open. */
  markCardReady: () => void
  /**
   * User hit End inside the structured exchange. Suppress predict/reveal/reflect/card
   * UI but keep the choice pill on the prior affordance message visible — the
   * chat needs to remain legible for someone scrolling back. Idempotent.
   */
  endExchange: () => void
  /** User clicked Open on the inline card. Open the side panel on the map view. */
  openCard: () => void
  /** User clicked the central map node. Switch the side panel to the workshop. */
  enterWorkshop: () => void

  // Side panel chrome ------------------------------------------------------
  setSidePanel: (next: Partial<SidePanelState>) => void
  closeSidePanel: () => void
}

/**
 * Exported so the /debug route can supply isolated mock stores per zone — each
 * debug card needs its own arc state without leaking into the real arc.
 * Production code should use `usePrototypeStore` instead of consuming this
 * context directly.
 */
export const PrototypeContext = createContext<PrototypeStore | null>(null)

function loadFromStorage(): PrototypeState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PrototypeState
    // If the stored arc points at a concept that no longer exists in the
    // registry (e.g., we renamed promise-all-hang → promise-all), drop the
    // arc and side panel rather than crash later when getConcept() throws.
    const cid = parsed.arc?.conceptId
    if (cid && !VALID_CONCEPT_IDS.has(cid)) {
      return { arc: EMPTY_ARC, sidePanel: EMPTY_SIDE_PANEL }
    }
    return parsed
  } catch {
    return null
  }
}

const VALID_CONCEPT_IDS = new Set<string>(CONCEPTS.map((c) => c.id))

function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && VALID_CONCEPT_IDS.has(value)
}

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const { lastCompletion, chats, streamCompletion, appendAssistantMessage } = useChatStore()
  const [state, setState] = useState<PrototypeState>(INITIAL_STATE)
  const [hydrated, setHydrated] = useState(false)

  // Mirror of state for use inside side-effecting callbacks. Lets actions
  // read the latest arc state without re-creating the callback on every
  // state change (which would otherwise cascade through the memoized store
  // value and re-render every consumer).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const chatsRef = useRef(chats)
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
    // Deferred localStorage hydration avoids SSR/client mismatch: initial
    // render uses INITIAL_STATE both sides; restore happens post-mount.
    const stored = loadFromStorage()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setState(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Quota or private-mode failures are non-fatal; the demo just won't survive a reload.
    }
  }, [state, hydrated])

  const resetArc = useCallback(() => {
    setState({ arc: EMPTY_ARC, sidePanel: EMPTY_SIDE_PANEL })
  }, [])

  const fireArc = useCallback((input: FireArcInput) => {
    setState((s) => ({
      ...s,
      arc: {
        ...EMPTY_ARC,
        beat: 'choosing',
        conceptId: input.conceptId,
        chatId: input.chatId,
        triggerMessageId: input.triggerMessageId,
        affordanceMessageId: input.affordanceMessageId ?? null,
      },
    }))
  }, [])

  // Observe the chat-store's lastCompletion. When the classifier returns an
  // arc meta and we're not already in an arc, transition idle → choosing.
  // The guard on arc.beat === 'idle' prevents re-firing if a later beat
  // (whose meta would normally be { isArc: false } anyway) accidentally emits
  // isArc: true.
  useEffect(() => {
    if (!lastCompletion) return
    const { meta, chatId, triggerMessageId } = lastCompletion
    if (!meta.isArc || !isConceptId(meta.conceptId)) return
    // Cross-store sync: chat-store's lastCompletion fires the arc here.
    // setState-in-effect is intentional — this IS the subscription bridge
    // between the two stores; only effectful path that mutates arc state
    // in response to an external observable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => {
      if (s.arc.beat !== 'idle') return s
      return {
        ...s,
        arc: {
          ...EMPTY_ARC,
          beat: 'choosing',
          conceptId: meta.conceptId as ConceptId,
          chatId,
          triggerMessageId,
          affordanceMessageId: null,
        },
      }
    })
  }, [lastCompletion])

  const chooseWrapper = useCallback(() => {
    const { arc } = stateRef.current
    if (!arc.chatId || !arc.conceptId) return

    setState((s) => ({
      ...s,
      arc: { ...s.arc, path: 'wrapper', beat: 'wrapper-response' },
    }))

    // Fire the wrapper-response stream. The chat-store commits the result
    // as a new assistant message in the arc's chat.
    const chat = chatsRef.current.find((c) => c.id === arc.chatId)
    if (!chat) return
    const apiMessages = chat.messages.map((m) => ({ role: m.role, content: m.text }))
    streamCompletion(arc.chatId, {
      endpoint: '/api/wrapper-response',
      body: { conceptId: arc.conceptId, messages: apiMessages },
    }).catch(() => {
      /* already logged in chat-store */
    })
  }, [streamCompletion])

  const chooseLearn = useCallback(async () => {
    const { arc } = stateRef.current
    if (!arc.chatId || !arc.conceptId) return
    const conceptId = arc.conceptId
    const chatId = arc.chatId
    const concept = getConcept(conceptId)

    setState((s) => ({
      ...s,
      arc: { ...s.arc, path: 'learning', beat: 'predicting' },
    }))

    // Live predict-beat endpoint: framing + options come from tool-use. If
    // the endpoint fails after retries (or returns an unusable payload), we
    // degrade to the concept registry's fallback so the arc still advances.
    let framing = concept.descriptors.fallback.predictionOptions.framing
    let options: PredictionOption[] = concept.descriptors.fallback.predictionOptions.options
    try {
      const res = await fetch('/api/prediction-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId }),
      })
      if (res.ok && res.body) {
        const live: { framing?: string; options?: PredictionOption[] } = {}
        await parseEnvelope(res.body, {
          onData: (data) => {
            if (typeof data.framing === 'string') live.framing = data.framing
            if (Array.isArray(data.options)) live.options = data.options as PredictionOption[]
          },
        })
        if (live.framing && live.options && live.options.length > 0) {
          framing = live.framing
          options = live.options
        }
      }
    } catch {
      // Network/parse errors → keep registry fallback.
    }

    setState((s) => ({
      ...s,
      arc: { ...s.arc, predictionOptions: { framing, options } },
    }))
    appendAssistantMessage(chatId, `${framing}\n\n<prediction-options/>`)
  }, [appendAssistantMessage])

  const recordPrediction = useCallback(
    async (prediction: Prediction) => {
      const { arc } = stateRef.current
      if (!arc.chatId || !arc.conceptId) return
      const chatId = arc.chatId
      const conceptId = arc.conceptId
      const concept = getConcept(conceptId)

      // Resolve the chosen option's metadata (label + misconceptionTag) for
      // the /api/reveal system prompt so it can name the near-miss explicitly.
      const liveOptions = arc.predictionOptions?.options
      const allOptions = liveOptions ?? concept.descriptors.fallback.predictionOptions.options
      const chosenOption = prediction.optionId
        ? allOptions.find((o) => o.id === prediction.optionId)
        : undefined
      const predictionPayload = {
        optionId: prediction.optionId,
        freeText: prediction.freeText,
        misconceptionTag: chosenOption?.misconceptionTag,
        predictionLabel: chosenOption?.label,
      }

      // 1. Capture prediction, advance to revealing.
      setState((s) => ({
        ...s,
        arc: { ...s.arc, prediction, beat: 'revealing' },
      }))

      // 2. Stream the reveal. streamCompletion commits the assistant message
      //    on completion. We deliberately don't pass the chat history — the
      //    predict-framing message in the history was nudging the model to
      //    skip the honor-first paragraph and dive straight into "what
      //    happens." The system prompt already has the concept, the
      //    prediction, and the misconception tag; the user's original wrapper
      //    ask is referenced explicitly inside the prompt. Cleaner without
      //    competing context. If the endpoint fails after retries, fall back
      //    to the concept registry's static reveal so the arc still advances.
      let revealText = ''
      try {
        const result = await streamCompletion(chatId, {
          endpoint: '/api/reveal',
          body: { conceptId, prediction: predictionPayload },
        })
        revealText = result.text
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        revealText = concept.descriptors.fallback.reveal
        appendAssistantMessage(chatId, revealText)
      }

      // 3. Capture reveal, advance to reflecting.
      setState((s) => ({
        ...s,
        arc: { ...s.arc, reveal: { text: revealText }, beat: 'reflecting' },
      }))

      // 4. Fetch the live reflection framing in parallel with showing the
      //    reflect surface. Falls back to the registry on persistent failure.
      let reflectFraming = concept.descriptors.fallback.reflectionFraming
      try {
        const res = await fetch('/api/reflection-framing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId, revealText }),
        })
        if (res.ok && res.body) {
          const live: { framing?: string } = {}
          await parseEnvelope(res.body, {
            onData: (data) => {
              if (typeof data.framing === 'string') live.framing = data.framing
            },
          })
          if (live.framing) reflectFraming = live.framing
        }
      } catch {
        // Network/parse error → keep registry fallback.
      }

      setState((s) => ({
        ...s,
        arc: { ...s.arc, reflectionFraming: reflectFraming },
      }))

      // 5. Append reflect prompt + inline <reflection-input/>.
      appendAssistantMessage(chatId, `${reflectFraming}\n\n<reflection-input/>`)
    },
    [appendAssistantMessage, streamCompletion],
  )

  const recordReveal = useCallback((reveal: { text: string }) => {
    setState((s) => ({
      ...s,
      arc: { ...s.arc, reveal, beat: 'reflecting' },
    }))
  }, [])

  const recordReflection = useCallback(
    async (reflection: { text: string }) => {
      const { arc } = stateRef.current
      if (!arc.chatId || !arc.conceptId) return
      const chatId = arc.chatId
      const conceptId = arc.conceptId
      const concept = getConcept(conceptId)

      setState((s) => ({
        ...s,
        arc: { ...s.arc, reflection, beat: 'card-ready' },
      }))

      // 1. Fetch the card meta (framing + canonical conceptTitle). Falls back
      //    to the registry on persistent failure.
      let framing = concept.descriptors.fallback.cardMeta.framing
      let conceptTitle = concept.descriptors.fallback.cardMeta.conceptTitle
      try {
        const res = await fetch('/api/card-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId, reflectionText: reflection.text }),
        })
        if (res.ok && res.body) {
          const live: { framing?: string; conceptTitle?: string } = {}
          await parseEnvelope(res.body, {
            onData: (data) => {
              if (typeof data.framing === 'string') live.framing = data.framing
              if (typeof data.conceptTitle === 'string') live.conceptTitle = data.conceptTitle
            },
          })
          if (live.framing) framing = live.framing
          if (live.conceptTitle) conceptTitle = live.conceptTitle
        }
      } catch {
        // Network/parse error → keep registry fallback.
      }

      setState((s) => ({
        ...s,
        arc: { ...s.arc, cardMeta: { framing, conceptTitle } },
      }))

      // 2. Commit the card framing + inline <reflection-card/>.
      appendAssistantMessage(chatId, `${framing}\n\n<reflection-card/>`)

      // 3. Stream the post-card continuation — the wrapper Claude promised
      //    when the user took the learning path. Uses /api/wrapper-response
      //    with afterLearning=true so the prompt skips re-explaining the
      //    concept and bridges directly to the code.
      //
      //    We pass ONLY the user's original trigger message (the first user
      //    turn). Passing the full history would end the conversation on an
      //    assistant turn (the card), which Anthropic rejects for non-prefill
      //    models — and the system prompt with afterLearning=true already
      //    carries the context the model needs.
      const chat = chatsRef.current.find((c) => c.id === chatId)
      const firstUserMessage = chat?.messages.find((m) => m.role === 'user')
      const apiMessages = firstUserMessage
        ? [{ role: 'user' as const, content: firstUserMessage.text }]
        : []
      streamCompletion(chatId, {
        endpoint: '/api/wrapper-response',
        body: { conceptId, messages: apiMessages, afterLearning: true },
      }).catch(() => {
        /* already logged in chat-store; arc state remains card-ready */
      })
    },
    [appendAssistantMessage, streamCompletion],
  )

  const markCardReady = useCallback(() => {
    setState((s) => ({ ...s, arc: { ...s.arc, beat: 'card-ready' } }))
  }, [])

  const endExchange = useCallback(() => {
    setState((s) => ({ ...s, arc: { ...s.arc, beat: 'exchange-ended' } }))
  }, [])

  const openCard = useCallback(() => {
    setState((s) => ({
      ...s,
      arc: { ...s.arc, beat: 'map-open' },
      sidePanel: { open: true, view: 'map' },
    }))

    // Fire-and-forget the ghost-nodes fetch. The MapView reads from
    // arc.ghostNodes when set; the registry fallback covers the moment between
    // open and the live result landing. Side panel transition is 250ms; this
    // fetch typically lands well after.
    const { arc } = stateRef.current
    if (!arc.conceptId) return
    const conceptId = arc.conceptId
    const reflectionText = arc.reflection?.text ?? ''
    void (async () => {
      try {
        const res = await fetch('/api/ghost-nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId, reflectionText }),
        })
        if (!res.ok || !res.body) return
        let live: GhostNode[] | null = null
        await parseEnvelope(res.body, {
          onData: (data) => {
            if (Array.isArray(data.ghosts)) {
              const ghosts = data.ghosts as GhostNode[]
              if (ghosts.length >= 4) live = ghosts.slice(0, 4)
            }
          },
        })
        if (live) {
          setState((s) => ({ ...s, arc: { ...s.arc, ghostNodes: live } }))
        }
      } catch {
        /* Network/parse failure → MapView keeps the registry fallback. */
      }
    })()
  }, [])

  const enterWorkshop = useCallback(() => {
    setState((s) => ({
      ...s,
      arc: { ...s.arc, beat: 'workshop-open' },
      sidePanel: { open: true, view: 'workshop' },
    }))

    // Fire-and-forget the workshop-opening framing fetch. The WorkshopView
    // reads from arc.workshopOpening when set; registry fallback covers the
    // moment between view-switch and live result.
    const { arc } = stateRef.current
    if (!arc.conceptId) return
    const conceptId = arc.conceptId
    void (async () => {
      try {
        const res = await fetch('/api/workshop-opening', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId }),
        })
        if (!res.ok || !res.body) return
        let liveFraming: string | null = null
        await parseEnvelope(res.body, {
          onData: (data) => {
            if (typeof data.framing === 'string') liveFraming = data.framing
          },
        })
        if (liveFraming) {
          setState((s) => ({
            ...s,
            arc: { ...s.arc, workshopOpening: { framing: liveFraming! } },
          }))
        }
      } catch {
        /* WorkshopView keeps the registry fallback. */
      }
    })()
  }, [])

  const setSidePanel = useCallback((next: Partial<SidePanelState>) => {
    setState((s) => ({ ...s, sidePanel: { ...s.sidePanel, ...next } }))
  }, [])

  const closeSidePanel = useCallback(() => {
    setState((s) => ({ ...s, sidePanel: { ...s.sidePanel, open: false } }))
  }, [])

  const value = useMemo<PrototypeStore>(
    () => ({
      state,
      resetArc,
      fireArc,
      chooseWrapper,
      chooseLearn,
      recordPrediction,
      recordReveal,
      recordReflection,
      markCardReady,
      endExchange,
      openCard,
      enterWorkshop,
      setSidePanel,
      closeSidePanel,
    }),
    [
      state,
      resetArc,
      fireArc,
      chooseWrapper,
      chooseLearn,
      recordPrediction,
      recordReveal,
      recordReflection,
      markCardReady,
      endExchange,
      openCard,
      enterWorkshop,
      setSidePanel,
      closeSidePanel,
    ],
  )

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototypeStore() {
  const ctx = useContext(PrototypeContext)
  if (!ctx) throw new Error('usePrototypeStore must be used within PrototypeProvider')
  return ctx
}
