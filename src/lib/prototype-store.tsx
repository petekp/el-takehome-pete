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
  classifyPrediction1FreeText,
  classifyPrediction2FreeText,
  CLOSING_BUBBLE,
  OPENING_BUBBLES,
  PREDICTION_1,
  PREDICTION_2,
  REVEAL_1_PATHS,
  REVEAL_2_PATHS,
  type Bubble,
  type ElementCue,
  type FocusState,
  type Molecule,
  type Prediction1Key,
  type Prediction2Key,
} from './artifact-script'
import { useChatStore } from './chat-store'
import type { ImageAttachment } from './types'

/**
 * State umbrella for the artifact arc. Composed under ChatProvider so the
 * arc's own concerns — beat progression, the artifact's interactive state —
 * don't leak into the generic chat layer.
 *
 * After the XeF2 pivot, the artifact additionally tracks:
 *   - activeMolecule: which molecule the 3D viewport is currently rendering.
 *   - chipState: which toggle chips (bonds / lone pairs / equatorial plane /
 *     bond angles) are currently on. Atoms are always on. Lone pairs default
 *     ON (they're the point of this artifact).
 *   - rotated: whether the user has touched the 3D scene yet. Beat 3 gates
 *     advancement on this so the visualization gets engagement before the
 *     first prediction.
 *   - activePanel: which representation panel is in "isolation mode" (Lewis-
 *     focused beats dim the rest while she reads from a single panel).
 *   - userAttachments: the photos the student attached on the trigger
 *     message; surfaced as thumbnails in the "Your materials" panel.
 */

export type ArcPath = 'wrapper' | 'learning'

export type ArcBeat =
  | 'idle'
  | 'choosing'
  | 'wrapper-response'
  | 'artifact-active'
  | 'artifact-resolved'
  | 'wrapper-followup'

/**
 * Where the user is inside the artifact.
 *
 *   opening      — Beats 1–3: name the materials, read the Lewis, equatorial
 *                  reveal (rotation-gated).
 *   predict-1    — Beat 4: "why equatorial?" prediction.
 *   reveal-1     — Beats 5–6: misconception branch + 180° bond-angle close.
 *   predict-2    — Beat 7: "5 domains, 2 lone pairs — what shape?"
 *   reveal-2     — Beat 8: ClF3 morph + T-shape reveal.
 *   closing      — Beat 9: summary card + resources.
 */
export type ArtifactStage =
  | 'opening'
  | 'predict-1'
  | 'reveal-1'
  | 'predict-2'
  | 'reveal-2'
  | 'closing'

export type ArtifactPrediction1 = {
  optionId?: Prediction1Key
  freeText?: string
  key: Prediction1Key
}

export type ArtifactPrediction2 = {
  optionId?: Prediction2Key
  freeText?: string
  key: Prediction2Key
}

export type ChipKey = 'bonds' | 'lonePairs' | 'equatorialPlane' | 'angles'

export type ChipState = Record<ChipKey, boolean>

export type RepresentationPanelId = 'materials' | 'lewis' | 'wedge' | 'geometry'

export type ArtifactState = {
  stage: ArtifactStage
  bubbleIndex: number
  focus: FocusState
  activeMolecule: Molecule
  chipState: ChipState
  /** Accumulated rotation in radians since the artifact opened. The
   *  rotation gate satisfies at >= PI/2 (90 deg). */
  rotationRad: number
  /** Set of representation panels the user has clicked at least once.
   *  Drives the panels-explored gate. */
  panelsExplored: RepresentationPanelId[]
  /** Which panel (if any) is currently driving isolation/treatment mode
   *  on the 3D scene. null = default rendering. */
  activePanel: RepresentationPanelId | null
  prediction1: ArtifactPrediction1 | null
  prediction2: ArtifactPrediction2 | null
  /** Photos the user attached to the trigger message. Rendered as
   *  thumbnails in the Materials panel. */
  userAttachments: ImageAttachment[]
}

export type ArcState = {
  beat: ArcBeat
  path: ArcPath | null
  conceptId: ConceptId | null
  chatId: string | null
  triggerMessageId: string | null
  affordanceMessageId: string | null
  artifactMessageId: string | null
  artifact: ArtifactState | null
}

export type PrototypeState = {
  arc: ArcState
}

/**
 * Default chip state. Lone pairs default ON — the whole artifact is about
 * where they sit. Equatorial plane and bond angles default off; users
 * toggle them on as the bubbles call attention to them, with the artifact
 * driving the state forward at the right beats.
 */
const DEFAULT_CHIP_STATE: ChipState = {
  bonds: true,
  lonePairs: true,
  equatorialPlane: false,
  angles: false,
}

const EMPTY_ARTIFACT: ArtifactState = {
  stage: 'opening',
  bubbleIndex: 0,
  focus: 'materials',
  activeMolecule: 'xef2',
  chipState: DEFAULT_CHIP_STATE,
  rotationRad: 0,
  panelsExplored: [],
  activePanel: null,
  prediction1: null,
  prediction2: null,
  userAttachments: [],
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

// Bumped from v3: v4 polish pass changed the artifact state shape
// (rotationRad replaces rotated, added panelsExplored). Force a fresh
// start for returning users.
const STORAGE_KEY = 'education-labs:prototype-state:v4-xef2-polish'
const STALE_STORAGE_KEYS = [
  'education-labs:prototype-state',
  'education-labs:prototype-state:v2-chemistry',
  'education-labs:prototype-state:v3-xef2',
]

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
  advanceArtifact: (opts?: { force?: boolean }) => void
  retreatArtifact: () => void
  recordPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  recordPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  closeArtifact: () => void

  // Artifact UI state -----------------------------------------------------
  toggleChip: (key: ChipKey) => void
  /** Set a chip directly. Used by beats that drive a specific chip on/off. */
  setChip: (key: ChipKey, value: boolean) => void
  /** Click a representation panel — enters that panel's 3D treatment mode
   *  and records the click against the panels-explored gate. */
  clickPanel: (id: RepresentationPanelId) => void
  /** Accumulate rotation delta (radians). The rotation gate satisfies at
   *  ROTATION_GATE_RAD. */
  addRotation: (deltaRad: number) => void
}

export const PrototypeContext = createContext<PrototypeStore | null>(null)

const VALID_CONCEPT_IDS = new Set<string>(CONCEPTS.map((c) => c.id))

function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && VALID_CONCEPT_IDS.has(value)
}

function loadFromStorage(): PrototypeState | null {
  if (typeof window === 'undefined') return null
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

/** Bubble sequence for the current stage of an artifact. */
export function bubblesForStage(
  stage: ArtifactStage,
  prediction1: ArtifactPrediction1 | null,
  prediction2: ArtifactPrediction2 | null,
): Bubble[] {
  if (stage === 'opening') return OPENING_BUBBLES
  if (stage === 'predict-1' || stage === 'predict-2') return []
  if (stage === 'reveal-1') {
    const key = prediction1?.key ?? 'unclassified'
    return REVEAL_1_PATHS[key].reveal1
  }
  if (stage === 'reveal-2') {
    const key = prediction2?.key ?? 'unclassified'
    return REVEAL_2_PATHS[key]
  }
  return [CLOSING_BUBBLE]
}

/** 90 degrees of accumulated rotation satisfies the rotation gate. */
export const ROTATION_GATE_RAD = Math.PI / 2

/** The three "literacy" panels that the panels-explored gate counts against.
 *  Materials is excluded — it opens a lightbox, not the 3D treatment. */
export const LITERACY_PANELS: RepresentationPanelId[] = ['lewis', 'wedge', 'geometry']

/** Whether the active bubble's gate (if any) is satisfied. */
function isGateSatisfied(bubble: Bubble | undefined, artifact: ArtifactState): boolean {
  if (!bubble?.gate) return true
  if (bubble.gate === 'rotation') return artifact.rotationRad >= ROTATION_GATE_RAD
  if (bubble.gate === 'panels-explored') {
    return LITERACY_PANELS.every((id) => artifact.panelsExplored.includes(id))
  }
  return true
}

/** Public read-only helper that lets the UI render gate progress. */
export function gateProgress(
  bubble: Bubble | null | undefined,
  artifact: ArtifactState,
): { satisfied: boolean; current: number; total: number; label: string } | null {
  if (!bubble?.gate) return null
  if (bubble.gate === 'rotation') {
    const total = ROTATION_GATE_RAD
    const current = Math.min(artifact.rotationRad, total)
    const pct = Math.round((current / total) * 100)
    return {
      satisfied: current >= total,
      current,
      total,
      label: pct >= 100 ? 'Rotated' : `${pct}% rotated`,
    }
  }
  if (bubble.gate === 'panels-explored') {
    const total = LITERACY_PANELS.length
    const current = artifact.panelsExplored.filter((id) => LITERACY_PANELS.includes(id)).length
    return {
      satisfied: current >= total,
      current,
      total,
      label: `${current} of ${total} panels explored`,
    }
  }
  return null
}

/** What cue, if any, the active bubble is broadcasting. */
export function activeCue(artifact: ArtifactState | null): ElementCue | null {
  if (!artifact) return null
  const bubble = bubblesForStage(artifact.stage, artifact.prediction1, artifact.prediction2)[
    artifact.bubbleIndex
  ]
  return bubble?.cue ?? null
}

/**
 * Chip side-effects driven by focus state. Each focus transition can flip
 * specific chips on. We don't flip them OFF here — once the user has seen
 * them, they're allowed to stay on for the rest of the arc unless the user
 * explicitly toggles them off.
 */
function chipUpdatesForFocus(focus: FocusState, current: ChipState): Partial<ChipState> {
  switch (focus) {
    case 'equatorial-reveal':
      return { equatorialPlane: true, lonePairs: true }
    case 'axial-bond-angle':
      return { angles: true, lonePairs: true }
    case 'closing':
      return { lonePairs: true, angles: true }
    default:
      return current
  }
}

function applyChipUpdates(state: ChipState, updates: Partial<ChipState>): ChipState {
  return { ...state, ...updates }
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
    const apiMessages = chat.messages.map((m) =>
      m.attachments && m.attachments.length > 0
        ? {
            role: m.role,
            content: [
              ...m.attachments.map((a) => ({
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: a.mediaType,
                  data: a.data,
                },
              })),
              ...(m.text.length > 0 ? [{ type: 'text' as const, text: m.text }] : []),
            ],
          }
        : { role: m.role, content: m.text },
    )
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

    // Snapshot the user's attachments from the trigger message. The
    // artifact's "Your materials" panel renders these as thumbnails so
    // the demo's grounded-in-real-materials story reads at a glance.
    const chat = chatsRef.current.find((c) => c.id === chatId)
    const triggerMsg = chat?.messages.find((m) => m.id === arc.triggerMessageId)
    const fallbackTriggerMsg = chat?.messages.find((m) => m.role === 'user')
    const userAttachments =
      (triggerMsg ?? fallbackTriggerMsg)?.attachments ?? []

    setState((s) => ({
      ...s,
      arc: {
        ...s.arc,
        path: 'learning',
        beat: 'artifact-active',
        artifact: { ...EMPTY_ARTIFACT, userAttachments },
      },
    }))

    const id = appendAssistantMessage(chatId, '<artifact/>')
    setState((s) => ({ ...s, arc: { ...s.arc, artifactMessageId: id } }))
  }, [appendAssistantMessage])

  const advanceArtifact = useCallback((opts?: { force?: boolean }) => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      const bubbles = bubblesForStage(a.stage, a.prediction1, a.prediction2)
      const currentBubble = bubbles[a.bubbleIndex]

      if (!opts?.force && !isGateSatisfied(currentBubble, a)) return s

      const nextIndex = a.bubbleIndex + 1
      if (nextIndex < bubbles.length) {
        const nextBubble = bubbles[nextIndex]
        const nextFocus = nextBubble.focus ?? a.focus
        return {
          ...s,
          arc: {
            ...s.arc,
            artifact: {
              ...a,
              bubbleIndex: nextIndex,
              focus: nextFocus,
              activeMolecule: nextBubble.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(nextFocus, a.chipState)),
            },
          },
        }
      }
      // End of current stage — transition to the next.
      if (a.stage === 'opening') {
        return { ...s, arc: { ...s.arc, artifact: { ...a, stage: 'predict-1', bubbleIndex: 0 } } }
      }
      if (a.stage === 'reveal-1') {
        return { ...s, arc: { ...s.arc, artifact: { ...a, stage: 'predict-2', bubbleIndex: 0 } } }
      }
      if (a.stage === 'reveal-2') {
        const closing = bubblesForStage('closing', a.prediction1, a.prediction2)
        const closingFocus = closing[0]?.focus ?? a.focus
        return {
          ...s,
          arc: {
            ...s.arc,
            beat: 'artifact-resolved',
            artifact: {
              ...a,
              stage: 'closing',
              bubbleIndex: 0,
              focus: closingFocus,
              activeMolecule: closing[0]?.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(closingFocus, a.chipState)),
            },
          },
        }
      }
      return s
    })
  }, [])

  const retreatArtifact = useCallback(() => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      // Within-stage retreat: just decrement.
      if (a.bubbleIndex > 0) {
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
      }
      // Cross-stage retreat: hop to the previous stage's last bubble.
      // Predictions stay recorded — going back doesn't undo a prediction.
      const prevStage: ArtifactStage | null =
        a.stage === 'predict-1'
          ? 'opening'
          : a.stage === 'reveal-1'
            ? 'predict-1'
            : a.stage === 'predict-2'
              ? 'reveal-1'
              : a.stage === 'reveal-2'
                ? 'predict-2'
                : a.stage === 'closing'
                  ? 'reveal-2'
                  : null
      if (!prevStage) return s
      const prevBubbles = bubblesForStage(prevStage, a.prediction1, a.prediction2)
      const prevIndex = Math.max(0, prevBubbles.length - 1)
      const prevBubble = prevBubbles[prevIndex]
      return {
        ...s,
        arc: {
          ...s.arc,
          artifact: {
            ...a,
            stage: prevStage,
            bubbleIndex: prevIndex,
            focus: prevBubble?.focus ?? a.focus,
            activeMolecule: prevBubble?.molecule ?? a.activeMolecule,
          },
        },
      }
    })
  }, [])

  const recordPrediction1 = useCallback(
    (input: { optionId?: Prediction1Key; freeText?: string }) => {
      setState((s) => {
        const a = s.arc.artifact
        if (!a) return s
        const key: Prediction1Key = input.optionId
          ? input.optionId
          : input.freeText
            ? classifyPrediction1FreeText(input.freeText)
            : 'unclassified'
        const prediction1: ArtifactPrediction1 = {
          optionId: input.optionId,
          freeText: input.freeText,
          key,
        }
        const reveal1 = REVEAL_1_PATHS[key].reveal1
        const first = reveal1[0]
        const nextFocus = first?.focus ?? a.focus
        return {
          ...s,
          arc: {
            ...s.arc,
            artifact: {
              ...a,
              prediction1,
              stage: 'reveal-1',
              bubbleIndex: 0,
              focus: nextFocus,
              activeMolecule: first?.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(nextFocus, a.chipState)),
            },
          },
        }
      })
    },
    [],
  )

  const recordPrediction2 = useCallback(
    (input: { optionId?: Prediction2Key; freeText?: string }) => {
      setState((s) => {
        const a = s.arc.artifact
        if (!a) return s
        const key: Prediction2Key = input.optionId
          ? input.optionId
          : input.freeText
            ? classifyPrediction2FreeText(input.freeText)
            : 'unclassified'
        const prediction2: ArtifactPrediction2 = {
          optionId: input.optionId,
          freeText: input.freeText,
          key,
        }
        const reveal2 = REVEAL_2_PATHS[key]
        const first = reveal2[0]
        const nextFocus = first?.focus ?? a.focus
        return {
          ...s,
          arc: {
            ...s.arc,
            artifact: {
              ...a,
              prediction2,
              stage: 'reveal-2',
              bubbleIndex: 0,
              focus: nextFocus,
              activeMolecule: first?.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(nextFocus, a.chipState)),
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

    // Stream the post-artifact follow-up using only the original trigger
    // message — the artifact lived outside chat history and the system
    // prompt already carries the spatial context.
    const chat = chatsRef.current.find((c) => c.id === chatId)
    const firstUserMessage = chat?.messages.find((m) => m.role === 'user')
    const apiMessages = firstUserMessage
      ? [
          firstUserMessage.attachments && firstUserMessage.attachments.length > 0
            ? {
                role: 'user' as const,
                content: [
                  ...firstUserMessage.attachments.map((a) => ({
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: a.mediaType,
                      data: a.data,
                    },
                  })),
                  ...(firstUserMessage.text.length > 0
                    ? [{ type: 'text' as const, text: firstUserMessage.text }]
                    : []),
                ],
              }
            : { role: 'user' as const, content: firstUserMessage.text },
        ]
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
          artifact: { ...a, chipState: { ...a.chipState, [key]: !a.chipState[key] } },
        },
      }
    })
  }, [])

  const setChip = useCallback((key: ChipKey, value: boolean) => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      return {
        ...s,
        arc: {
          ...s.arc,
          artifact: { ...a, chipState: { ...a.chipState, [key]: value } },
        },
      }
    })
  }, [])

  const clickPanel = useCallback((id: RepresentationPanelId) => {
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      const activePanel = a.activePanel === id ? null : id
      const panelsExplored = a.panelsExplored.includes(id)
        ? a.panelsExplored
        : [...a.panelsExplored, id]
      return {
        ...s,
        arc: { ...s.arc, artifact: { ...a, activePanel, panelsExplored } },
      }
    })
  }, [])

  const addRotation = useCallback((deltaRad: number) => {
    if (!Number.isFinite(deltaRad) || deltaRad <= 0) return
    setState((s) => {
      const a = s.arc.artifact
      if (!a) return s
      if (a.rotationRad >= ROTATION_GATE_RAD) return s
      const next = Math.min(a.rotationRad + deltaRad, ROTATION_GATE_RAD)
      if (next === a.rotationRad) return s
      return {
        ...s,
        arc: { ...s.arc, artifact: { ...a, rotationRad: next } },
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
      setChip,
      clickPanel,
      addRotation,
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
      setChip,
      clickPanel,
      addRotation,
    ],
  )

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototypeStore() {
  const ctx = useContext(PrototypeContext)
  if (!ctx) throw new Error('usePrototypeStore must be used within PrototypeProvider')
  return ctx
}

export { PREDICTION_1, PREDICTION_2 }
