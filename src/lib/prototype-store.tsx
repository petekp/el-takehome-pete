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
import { CONCEPTS, type ConceptId } from './concepts'
import {
  classifyFreeText,
  CLOSING_BUBBLE,
  OPENING_BUBBLES,
  PATHS,
  PREDICTION_1,
  type Bubble,
  type FocusState,
  type MisconceptionKey,
  type Molecule,
} from './artifact-script'
import { useChatStore } from './chat-store'

/**
 * State umbrella for the artifact arc. Composed under ChatProvider so the
 * arc's own concerns — beat progression, the artifact's interactive state —
 * don't leak into the generic chat layer.
 *
 * After the chemistry pivot, the artifact additionally tracks:
 *   - activeMolecule: which molecule the 3D viewport is currently rendering.
 *     Each bubble can declare a `molecule` field; advancing the bubble
 *     mutates activeMolecule and triggers a smooth transition in the scene.
 *   - chipState: which toggle chips (bonds / lone pairs / orbitals / angles)
 *     are currently on. Atoms are always on.
 *   - panelsClicked: which representation panels the user has clicked. The
 *     Beat-3 explore-the-panels bubble gates on this list reaching length 2.
 */

export type ArcPath = 'wrapper' | 'learning'

export type ArcBeat =
  | 'idle' // no trigger fired
  | 'choosing' // affordance shown; waiting for path selection
  | 'wrapper-response' // wrapper (decline) path streaming/complete
  | 'artifact-active' // artifact open inline in chat, user is engaging
  | 'artifact-resolved' // artifact reached the closing bubble; resources visible
  | 'wrapper-followup' // post-artifact follow-up message streaming/complete

/**
 * Where the user is inside the artifact. Drives the bubble script the
 * Artifact component reads.
 *
 *   opening    — beats 1–5: introducing the panels, exploring them, the
 *                Lewis-omits-angles line, the transition to ammonia.
 *   predict-1  — beat 6: Lewis-tells-shape prediction surface.
 *   reveal-1   — beats 7–8: misconception-specific honor-and-correct, plus
 *                the shared lone-pair-takes-space content and the
 *                NH3↔NH4⁺ toggle moment.
 *   predict-2  — beat 9: water-bond-angle prediction surface.
 *   reveal-2   — beat 10: bond-angle reveal, branched per follow-up answer.
 *   closing    — beat 11: multi-lens framing + resources.
 */
export type ArtifactStage =
  | 'opening'
  | 'predict-1'
  | 'reveal-1'
  | 'predict-2'
  | 'reveal-2'
  | 'closing'

export type ArtifactPrediction = {
  optionId?: string
  freeText?: string
  misconceptionTag: MisconceptionKey
}

export type ChipKey = 'bonds' | 'lonePairs' | 'orbitals' | 'angles'

export type ChipState = Record<ChipKey, boolean>

export type RepresentationPanelId = 'lewis' | 'wedge' | 'geometry'

export type ArtifactState = {
  stage: ArtifactStage
  bubbleIndex: number
  focus: FocusState
  activeMolecule: Molecule
  chipState: ChipState
  /** Representation panels the user has clicked. Drives the Beat-3 gate
   *  and feeds annotation-mode highlighting. */
  panelsClicked: RepresentationPanelId[]
  /** Which panel (if any) is currently driving annotation mode on the 3D
   *  scene. null = no annotation overlay. */
  activePanel: RepresentationPanelId | null
  prediction1: ArtifactPrediction | null
  prediction2: ArtifactPrediction | null
}

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
  /** Assistant message that hosts the <artifact/> tag. */
  artifactMessageId: string | null
  artifact: ArtifactState | null
}

export type PrototypeState = {
  arc: ArcState
}

const DEFAULT_CHIP_STATE: ChipState = {
  bonds: true,
  lonePairs: false,
  orbitals: false,
  angles: false,
}

const EMPTY_ARTIFACT: ArtifactState = {
  stage: 'opening',
  bubbleIndex: 0,
  focus: 'lewis-spotlight',
  activeMolecule: 'methane',
  chipState: DEFAULT_CHIP_STATE,
  panelsClicked: [],
  activePanel: null,
  prediction1: null,
  prediction2: null,
}

const EMPTY_ARC: ArcState = {
  beat: 'idle',
  path: null,
  conceptId: null,
  chatId: null,
  triggerMessageId: null,
  affordanceMessageId: null,
  artifactMessageId: null,
  artifact: null,
}

const INITIAL_STATE: PrototypeState = {
  arc: EMPTY_ARC,
}

// Bumped from v1: prior Promise.all state in localStorage is incompatible
// with the new chemistry state shape; force a fresh start for returning users.
const STORAGE_KEY = 'education-labs:prototype-state:v2-chemistry'
// Old keys to clean up on hydration so stale state from prior builds doesn't
// linger.
const STALE_STORAGE_KEYS = ['education-labs:prototype-state']

export type FireArcInput = {
  conceptId: ConceptId
  chatId: string
  triggerMessageId: string
  affordanceMessageId?: string
}

export type PrototypeStore = {
  state: PrototypeState

  // Lifecycle -------------------------------------------------------------
  resetArc: () => void

  // Arc transitions -------------------------------------------------------
  fireArc: (input: FireArcInput) => void
  chooseWrapper: () => void
  chooseLearn: () => void

  // Artifact transitions --------------------------------------------------
  /** Advance to the next bubble within the current stage. If there are no
   *  more bubbles in this stage, transition to the next stage automatically.
   *  Blocked when the active bubble has an unfulfilled gate. */
  advanceArtifact: () => void
  /** Step backward within the current stage. No cross-stage retreat — once
   *  the user has predicted, they own that prediction. */
  retreatArtifact: () => void
  /** Record the first prediction and route to the matching misconception
   *  branch. Sets stage to 'reveal-1'. */
  recordPrediction1: (input: { optionId?: string; freeText?: string }) => void
  /** Record the follow-up prediction. Sets stage to 'reveal-2'. */
  recordPrediction2: (input: { optionId?: string; freeText?: string }) => void
  /** User explicitly closes the artifact. Triggers the post-artifact
   *  follow-up message. */
  closeArtifact: () => void

  // Artifact UI state -----------------------------------------------------
  /** Toggle a chip on/off. Atoms are always on (not in ChipKey). */
  toggleChip: (key: ChipKey) => void
  /** Click a representation panel. Enters annotation mode for that panel
   *  and counts toward the Beat-3 explore gate. Click again to deactivate. */
  clickPanel: (id: RepresentationPanelId) => void
}

export const PrototypeContext = createContext<PrototypeStore | null>(null)

const VALID_CONCEPT_IDS = new Set<string>(CONCEPTS.map((c) => c.id))

function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && VALID_CONCEPT_IDS.has(value)
}

function loadFromStorage(): PrototypeState | null {
  if (typeof window === 'undefined') return null
  // Best-effort cleanup of prior schema's keys.
  for (const k of STALE_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PrototypeState
    const cid = parsed.arc?.conceptId
    if (cid && !VALID_CONCEPT_IDS.has(cid)) {
      return { arc: EMPTY_ARC }
    }
    return parsed
  } catch {
    return null
  }
}

function pickMisconceptionFromOption(optionId: string): MisconceptionKey {
  const opt = PREDICTION_1.options.find((o) => o.id === optionId)
  return opt?.misconceptionTag ?? 'unclassified'
}

/** Bubble sequence for the current stage of an artifact. */
export function bubblesForStage(
  stage: ArtifactStage,
  prediction1: ArtifactPrediction | null,
  prediction2: ArtifactPrediction | null,
): Bubble[] {
  if (stage === 'opening') return OPENING_BUBBLES
  if (stage === 'predict-1' || stage === 'predict-2') return []
  if (stage === 'reveal-1') {
    const key = prediction1?.misconceptionTag ?? 'unclassified'
    return PATHS[key].reveal1
  }
  if (stage === 'reveal-2') {
    const key = prediction1?.misconceptionTag ?? 'unclassified'
    const followUpId = prediction2?.optionId ?? Object.keys(PATHS[key].reveal2)[0]
    return PATHS[key].reveal2[followUpId] ?? []
  }
  // closing
  return [CLOSING_BUBBLE]
}

export function followUpFor(
  prediction1: ArtifactPrediction | null,
): { framing: string; options: typeof PREDICTION_1.options } {
  const key = prediction1?.misconceptionTag ?? 'unclassified'
  return PATHS[key].followUp
}

/** Whether the active bubble's gate (if any) is satisfied. */
function isGateSatisfied(bubble: Bubble | undefined, artifact: ArtifactState): boolean {
  if (!bubble?.gate) return true
  if (bubble.gate === 'panels-explored') {
    return artifact.panelsClicked.length >= 2
  }
  return true
}

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const { lastCompletion, chats, streamCompletion, appendAssistantMessage } = useChatStore()
  const [state, setState] = useState<PrototypeState>(INITIAL_STATE)
  const [hydrated, setHydrated] = useState(false)

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const chatsRef = useRef(chats)
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
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
      /* quota or private-mode failures are non-fatal */
    }
  }, [state, hydrated])

  const resetArc = useCallback(() => {
    // Also clear storage synchronously. React 19 mounts child effects before
    // parent's, so /new's resetArc fires before PrototypeProvider's
    // loadFromStorage. Without clearing storage here, the load can reinstate
    // stale state from a prior session.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* private mode etc. */
      }
    }
    setState({ arc: EMPTY_ARC })
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
  useEffect(() => {
    if (!lastCompletion) return
    const { meta, chatId, triggerMessageId } = lastCompletion
    if (!meta.isArc || !isConceptId(meta.conceptId)) return
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

  const chooseLearn = useCallback(() => {
    const { arc } = stateRef.current
    if (!arc.chatId || !arc.conceptId) return
    const chatId = arc.chatId

    setState((s) => ({
      ...s,
      arc: {
        ...s.arc,
        path: 'learning',
        beat: 'artifact-active',
        artifact: { ...EMPTY_ARTIFACT },
      },
    }))

    // Append the assistant message that hosts the <artifact/> tag. No
    // pre-prose — the bubbles speak. The tag itself is the message.
    const id = appendAssistantMessage(chatId, '<artifact/>')
    setState((s) => ({ ...s, arc: { ...s.arc, artifactMessageId: id } }))
  }, [appendAssistantMessage])

  const advanceArtifact = useCallback(() => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      const bubbles = bubblesForStage(a.stage, a.prediction1, a.prediction2)
      const currentBubble = bubbles[a.bubbleIndex]

      // Gate check — if the current bubble has an unsatisfied gate, do not
      // advance. The Artifact UI surfaces the gate state visually.
      if (!isGateSatisfied(currentBubble, a)) return s

      const nextIndex = a.bubbleIndex + 1
      if (nextIndex < bubbles.length) {
        const nextBubble = bubbles[nextIndex]
        return {
          ...s,
          arc: {
            ...s.arc,
            artifact: {
              ...a,
              bubbleIndex: nextIndex,
              focus: nextBubble.focus ?? a.focus,
              activeMolecule: nextBubble.molecule ?? a.activeMolecule,
            },
          },
        }
      }
      // End of current stage — transition.
      if (a.stage === 'opening') {
        return { ...s, arc: { ...s.arc, artifact: { ...a, stage: 'predict-1', bubbleIndex: 0 } } }
      }
      if (a.stage === 'reveal-1') {
        return { ...s, arc: { ...s.arc, artifact: { ...a, stage: 'predict-2', bubbleIndex: 0 } } }
      }
      if (a.stage === 'reveal-2') {
        const closing = bubblesForStage('closing', a.prediction1, a.prediction2)
        return {
          ...s,
          arc: {
            ...s.arc,
            beat: 'artifact-resolved',
            artifact: {
              ...a,
              stage: 'closing',
              bubbleIndex: 0,
              focus: closing[0]?.focus ?? a.focus,
              activeMolecule: closing[0]?.molecule ?? a.activeMolecule,
            },
          },
        }
      }
      // closing — stay put. user clicks "close" explicitly.
      return s
    })
  }, [])

  const retreatArtifact = useCallback(() => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a || a.bubbleIndex === 0) return s
      const bubbles = bubblesForStage(a.stage, a.prediction1, a.prediction2)
      const prevIndex = a.bubbleIndex - 1
      const prevBubble = bubbles[prevIndex]
      return {
        ...s,
        arc: {
          ...s.arc,
          artifact: {
            ...a,
            bubbleIndex: prevIndex,
            focus: prevBubble.focus ?? a.focus,
            activeMolecule: prevBubble.molecule ?? a.activeMolecule,
          },
        },
      }
    })
  }, [])

  const recordPrediction1 = useCallback(
    (input: { optionId?: string; freeText?: string }) => {
      setState((s) => {
        const a = s.arc.artifact
        if (!a) return s
        const tag: MisconceptionKey = input.optionId
          ? pickMisconceptionFromOption(input.optionId)
          : input.freeText
            ? classifyFreeText(input.freeText)
            : 'unclassified'
        const prediction1: ArtifactPrediction = {
          optionId: input.optionId,
          freeText: input.freeText,
          misconceptionTag: tag,
        }
        const reveal1 = PATHS[tag].reveal1
        const first = reveal1[0]
        return {
          ...s,
          arc: {
            ...s.arc,
            artifact: {
              ...a,
              prediction1,
              stage: 'reveal-1',
              bubbleIndex: 0,
              focus: first?.focus ?? a.focus,
              activeMolecule: first?.molecule ?? a.activeMolecule,
            },
          },
        }
      })
    },
    [],
  )

  const recordPrediction2 = useCallback(
    (input: { optionId?: string; freeText?: string }) => {
      setState((s) => {
        const a = s.arc.artifact
        if (!a) return s
        const followUp = followUpFor(a.prediction1)
        const opt = input.optionId ? followUp.options.find((o) => o.id === input.optionId) : null
        const tag: MisconceptionKey =
          opt?.misconceptionTag ?? a.prediction1?.misconceptionTag ?? 'unclassified'
        const prediction2: ArtifactPrediction = {
          optionId: input.optionId,
          freeText: input.freeText,
          misconceptionTag: tag,
        }
        const key = a.prediction1?.misconceptionTag ?? 'unclassified'
        const followUpId = input.optionId ?? Object.keys(PATHS[key].reveal2)[0]
        const reveal2 = PATHS[key].reveal2[followUpId] ?? []
        const first = reveal2[0]
        return {
          ...s,
          arc: {
            ...s.arc,
            artifact: {
              ...a,
              prediction2,
              stage: 'reveal-2',
              bubbleIndex: 0,
              focus: first?.focus ?? a.focus,
              activeMolecule: first?.molecule ?? a.activeMolecule,
            },
          },
        }
      })
    },
    [],
  )

  const closeArtifact = useCallback(() => {
    const { arc } = stateRef.current
    if (!arc.chatId || !arc.conceptId) return
    const chatId = arc.chatId
    const conceptId = arc.conceptId

    setState((s) => ({
      ...s,
      arc: { ...s.arc, beat: 'wrapper-followup' },
    }))

    // Stream the post-artifact follow-up message. Reuses /api/wrapper-response
    // with afterLearning=true so the prompt skips re-explaining the concept
    // and instead offers to look at sp²/sp hybridization or another molecule.
    //
    // Pass ONLY the user's original trigger message — the artifact lived
    // outside the regular chat history and the system prompt already carries
    // the context the model needs.
    const chat = chatsRef.current.find((c) => c.id === chatId)
    const firstUserMessage = chat?.messages.find((m) => m.role === 'user')
    const apiMessages = firstUserMessage
      ? [{ role: 'user' as const, content: firstUserMessage.text }]
      : []
    streamCompletion(chatId, {
      endpoint: '/api/wrapper-response',
      body: { conceptId, messages: apiMessages, afterLearning: true },
    }).catch(() => {
      /* already logged in chat-store */
    })
  }, [streamCompletion])

  const toggleChip = useCallback((key: ChipKey) => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      return {
        ...s,
        arc: {
          ...s.arc,
          artifact: {
            ...a,
            chipState: { ...a.chipState, [key]: !a.chipState[key] },
          },
        },
      }
    })
  }, [])

  const clickPanel = useCallback((id: RepresentationPanelId) => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      // Track unique clicks (so the gate registers exploration, not repeat
      // clicks on the same panel).
      const already = a.panelsClicked.includes(id)
      const panelsClicked = already ? a.panelsClicked : [...a.panelsClicked, id]
      // Toggle annotation mode: clicking the active panel deactivates it.
      const activePanel = a.activePanel === id ? null : id
      return {
        ...s,
        arc: { ...s.arc, artifact: { ...a, panelsClicked, activePanel } },
      }
    })
  }, [])

  const value = useMemo<PrototypeStore>(
    () => ({
      state,
      resetArc,
      fireArc,
      chooseWrapper,
      chooseLearn,
      advanceArtifact,
      retreatArtifact,
      recordPrediction1,
      recordPrediction2,
      closeArtifact,
      toggleChip,
      clickPanel,
    }),
    [
      state,
      resetArc,
      fireArc,
      chooseWrapper,
      chooseLearn,
      advanceArtifact,
      retreatArtifact,
      recordPrediction1,
      recordPrediction2,
      closeArtifact,
      toggleChip,
      clickPanel,
    ],
  )

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototypeStore() {
  const ctx = useContext(PrototypeContext)
  if (!ctx) throw new Error('usePrototypeStore must be used within PrototypeProvider')
  return ctx
}
