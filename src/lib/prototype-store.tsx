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
import { buildInteractionSummary } from './artifact-interaction'

/**
 * State umbrella for the artifact arc. Composed under ChatProvider so the
 * arc's own concerns — beat progression, the artifact's interactive state —
 * don't leak into the generic chat layer.
 *
 * After the XeF2 pivot + trust pass, the artifact additionally tracks:
 *   - activeMolecule: which molecule the 3D viewport is currently rendering.
 *   - chipState: which toggle chips (bonds / lone pairs / equatorial plane /
 *     bond angles) are currently on. Atoms are always on. Lone pairs default
 *     ON (they're the point of this artifact).
 *   - rotationRad: how much the user has rotated the 3D scene. Retained for
 *     the debug harness; the production arc no longer gates on it.
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
 *   opening      — Beats 1–2: name the blocking intuition + 3D ground truth.
 *   predict-1    — Beat 3: "why equatorial?" prediction.
 *   reveal-1     — Beats 4–5: misconception branch + strain demo.
 *   predict-2    — Beat 6: "5 domains, 2 lone pairs — what shape?"
 *   reveal-2     — Beat 7: ClF3 + 5-domain row control introduced.
 *   closing      — Beat 8: 3-layer synthesis + resources.
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

export type RepresentationPanelId = 'materials' | 'lewis' | 'geometry'

export type ArtifactState = {
  stage: ArtifactStage
  bubbleIndex: number
  focus: FocusState
  activeMolecule: Molecule
  chipState: ChipState
  /** Accumulated rotation in radians since the artifact opened. Retained
   *  for the debug harness; the production arc no longer gates on it. */
  rotationRad: number
  /** Set of representation panels the user has clicked at least once. */
  panelsExplored: RepresentationPanelId[]
  /** Which panel (if any) is currently driving isolation/treatment mode
   *  on the 3D scene. null = default rendering. */
  activePanel: RepresentationPanelId | null
  prediction1: ArtifactPrediction1 | null
  prediction2: ArtifactPrediction2 | null
  /** Photos the user attached to the trigger message. Rendered as
   *  thumbnails in the Materials panel. */
  userAttachments: ImageAttachment[]
  /** Epoch ms when the artifact opened. Used at close time to compute
   *  elapsed time in the artifact for the post-artifact follow-up. */
  openedAt: number
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

/**
 * Per-chat arc state. The store holds a map keyed by chatId so that returning
 * to a past thread keeps that thread's artifact open and available — starting
 * a new arc in another chat no longer wipes out the previous one.
 *
 * `currentChatId` identifies which chat's arc the UI is currently viewing /
 * mutating. Consumers should read the derived `state.arc` (computed at the
 * Provider boundary) which resolves to `arcs[currentChatId] ?? EMPTY_ARC`.
 */
export type PrototypeState = {
  arcs: Record<string, ArcState>
  currentChatId: string | null
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
  openedAt: 0,
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
  arcs: {},
  currentChatId: null,
}

// Bumped to v6: state shape changed from a single `arc` to per-chat `arcs`
// keyed by chatId, so threads keep their own artifact across navigation.
const STORAGE_KEY = 'education-labs:prototype-state:v6-per-chat'
const STALE_STORAGE_KEYS = [
  'education-labs:prototype-state',
  'education-labs:prototype-state:v2-chemistry',
  'education-labs:prototype-state:v3-xef2',
  'education-labs:prototype-state:v4-xef2-polish',
  'education-labs:prototype-state:v5-xef2-trust',
]

export type FireArcInput = {
  conceptId: ConceptId
  chatId: string
  triggerMessageId: string
  affordanceMessageId?: string
}

export type PrototypeStore = {
  /** State as seen by consumers. `arc` is derived from `arcs[currentChatId]`
   *  so existing call sites keep working unchanged. */
  state: PrototypeState & { arc: ArcState }

  // Lifecycle -------------------------------------------------------------
  resetArc: () => void
  /** Tell the store which chat is currently being viewed so transitions and
   *  the derived `state.arc` resolve to that chat's arc. */
  setCurrentChatId: (chatId: string | null) => void

  // Arc transitions -------------------------------------------------------
  fireArc: (input: FireArcInput) => void
  chooseWrapper: () => void
  chooseLearn: () => void

  // Artifact transitions --------------------------------------------------
  advanceArtifact: () => void
  retreatArtifact: () => void
  recordPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  recordPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  closeArtifact: () => void

  // Artifact UI state -----------------------------------------------------
  toggleChip: (key: ChipKey) => void
  /** Set a chip directly. Used by beats that drive a specific chip on/off. */
  setChip: (key: ChipKey, value: boolean) => void
  /** Click a representation panel — records the click, and enters 3D
   *  treatment mode for panels that have one. */
  clickPanel: (id: RepresentationPanelId) => void
  /** Accumulate rotation delta (radians). Used by the debug harness only. */
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
    const parsed = JSON.parse(raw) as Partial<PrototypeState>
    if (!parsed || typeof parsed !== 'object' || !parsed.arcs) return null
    // Drop arcs that reference unknown concepts (script schema changed).
    const cleaned: Record<string, ArcState> = {}
    for (const [chatId, arc] of Object.entries(parsed.arcs)) {
      if (arc?.conceptId && !VALID_CONCEPT_IDS.has(arc.conceptId)) continue
      cleaned[chatId] = arc
    }
    return { arcs: cleaned, currentChatId: parsed.currentChatId ?? null }
  } catch {
    return null
  }
}

/** Read the arc for the currently-viewed chat. Returns EMPTY_ARC when no
 *  chat is selected or the chat has no arc yet. */
function getActiveArc(s: PrototypeState): ArcState {
  if (!s.currentChatId) return EMPTY_ARC
  return s.arcs[s.currentChatId] ?? EMPTY_ARC
}

/** Apply an updater to the active arc and write it back into `arcs`. No-op
 *  when no chat is selected (the action has no target). */
function withActiveArc(
  s: PrototypeState,
  updater: (arc: ArcState) => ArcState,
): PrototypeState {
  const id = s.currentChatId
  if (!id) return s
  const current = s.arcs[id] ?? EMPTY_ARC
  const next = updater(current)
  if (next === current) return s
  return { ...s, arcs: { ...s.arcs, [id]: next } }
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

/** Retained for the `/artifact-debug` harness; gates are no longer used in
 *  the production arc but the type / constant must still resolve. */
export const ROTATION_GATE_RAD = Math.PI / 2

/** The two "literacy" panels still surfaced in the View menu. Wedge-and-dash
 *  was removed: for linear XeF2 it adds confusion without information. */
export const LITERACY_PANELS: RepresentationPanelId[] = ['lewis', 'geometry']

/** What cue, if any, the active bubble is broadcasting. */
export function activeCue(artifact: ArtifactState | null): ElementCue | null {
  if (!artifact) return null
  const bubble = bubblesForStage(artifact.stage, artifact.prediction1, artifact.prediction2)[
    artifact.bubbleIndex
  ]
  return bubble?.cue ?? null
}

/**
 * Chip side-effects driven by focus state. Each focus transition flips
 * the toggles needed to make the bubble's text match the visible scene.
 *
 *   The "bubble talks about lone pairs → lone pairs are visible" rule is
 *   driven from here, so the user never sees a contradiction between text
 *   and viz. We also turn things OFF when the next beat doesn't need
 *   them — leaving stale toggles on (e.g., equatorial plane disc still
 *   showing during the molecular-geometry beat) clutters the scene and
 *   muddles the layer being explained right now.
 */
function chipUpdatesForFocus(focus: FocusState): Partial<ChipState> {
  switch (focus) {
    case 'materials':
      // Opening — user has the molecule on screen but no specific viz overlay.
      return { lonePairs: true, equatorialPlane: false, angles: false }
    case 'equatorial-reveal':
      // 3D ground truth + reveal-1 — show lone pairs + the plane they sit in.
      return { lonePairs: true, equatorialPlane: true, angles: false }
    case 'predict-spatial':
      // Predict-1 — neutral. No answer-revealing overlays.
      return { lonePairs: true, equatorialPlane: false, angles: false }
    case 'axial-strain':
      // Strain demo — lone pairs are the actor.
      return { lonePairs: true, equatorialPlane: true, angles: false }
    case 'axial-bond-angle':
      // Molecular geometry — atoms + 180° angle take the foreground.
      return { lonePairs: true, equatorialPlane: false, angles: true }
    case 'predict-tshape':
      // Predict-2 — neutral; the row control is hidden at the UI layer too.
      return { lonePairs: true, equatorialPlane: false, angles: false }
    case 'clf3-tshape':
      // Reveal-2 — show the row-example payoff with the angle indicator on
      // so the T-shape reads.
      return { lonePairs: true, equatorialPlane: false, angles: true }
    case 'closing':
      return { lonePairs: true, equatorialPlane: false, angles: true }
    default:
      return {}
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
    setState(INITIAL_STATE)
  }, [])

  const setCurrentChatId = useCallback((chatId: string | null) => {
    setState((s) => (s.currentChatId === chatId ? s : { ...s, currentChatId: chatId }))
  }, [])

  const fireArc = useCallback((input: FireArcInput) => {
    setState((s) => ({
      ...s,
      currentChatId: input.chatId,
      arcs: {
        ...s.arcs,
        [input.chatId]: {
          ...EMPTY_ARC,
          beat: 'choosing',
          conceptId: input.conceptId,
          chatId: input.chatId,
          triggerMessageId: input.triggerMessageId,
          affordanceMessageId: input.affordanceMessageId ?? null,
        },
      },
    }))
  }, [])

  // Observe the chat-store's lastCompletion. When the classifier returns an
  // arc meta and that chat doesn't already have an active arc, transition
  // its arc from idle → choosing. Other chats' arcs are untouched.
  useEffect(() => {
    if (!lastCompletion) return
    const { meta, chatId, triggerMessageId } = lastCompletion
    if (!meta.isArc || !isConceptId(meta.conceptId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => {
      const existing = s.arcs[chatId]
      if (existing && existing.beat !== 'idle') return s
      return {
        ...s,
        currentChatId: chatId,
        arcs: {
          ...s.arcs,
          [chatId]: {
            ...EMPTY_ARC,
            beat: 'choosing',
            conceptId: meta.conceptId as ConceptId,
            chatId,
            triggerMessageId,
            affordanceMessageId: null,
          },
        },
      }
    })
  }, [lastCompletion])

  const chooseWrapper = useCallback(() => {
    const arc = getActiveArc(stateRef.current)
    if (!arc.chatId || !arc.conceptId) return

    setState((s) =>
      withActiveArc(s, (a) => ({ ...a, path: 'wrapper', beat: 'wrapper-response' })),
    )

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
    const arc = getActiveArc(stateRef.current)
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

    setState((s) =>
      withActiveArc(s, (a) => ({
        ...a,
        path: 'learning',
        beat: 'artifact-active',
        artifact: { ...EMPTY_ARTIFACT, userAttachments, openedAt: Date.now() },
      })),
    )

    const id = appendAssistantMessage(chatId, '<artifact/>')
    setState((s) => withActiveArc(s, (a) => ({ ...a, artifactMessageId: id })))
  }, [appendAssistantMessage])

  const advanceArtifact = useCallback(() => {
    setState((s) =>
      withActiveArc(s, (arc) => {
        const a = arc.artifact
        if (!a) return arc
        const bubbles = bubblesForStage(a.stage, a.prediction1, a.prediction2)

        const nextIndex = a.bubbleIndex + 1
        if (nextIndex < bubbles.length) {
          const nextBubble = bubbles[nextIndex]
          const nextFocus = nextBubble.focus ?? a.focus
          return {
            ...arc,
            artifact: {
              ...a,
              bubbleIndex: nextIndex,
              focus: nextFocus,
              activeMolecule: nextBubble.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(nextFocus)),
              // Clear stale view treatment so a previously-active panel
              // (Lewis / Molecular geometry) doesn't keep hiding things the
              // new bubble talks about.
              activePanel: null,
            },
          }
        }
        // End of current stage — transition to the next. Predict stages get
        // explicit focus + chip resets (no bubble drives them) so they don't
        // inherit answer-revealing overlays from the previous stage.
        if (a.stage === 'opening') {
          const focus = 'predict-spatial' as const
          return {
            ...arc,
            artifact: {
              ...a,
              stage: 'predict-1',
              bubbleIndex: 0,
              focus,
              activeMolecule: 'xef2',
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(focus)),
              activePanel: null,
            },
          }
        }
        if (a.stage === 'reveal-1') {
          // Predict-2 must not preview ClF3 — that's the answer. Keep XeF2 on
          // screen and clear any answer-revealing overlays.
          const focus = 'predict-tshape' as const
          return {
            ...arc,
            artifact: {
              ...a,
              stage: 'predict-2',
              bubbleIndex: 0,
              focus,
              activeMolecule: 'xef2',
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(focus)),
              activePanel: null,
            },
          }
        }
        if (a.stage === 'reveal-2') {
          const closing = bubblesForStage('closing', a.prediction1, a.prediction2)
          const closingFocus = closing[0]?.focus ?? a.focus
          return {
            ...arc,
            beat: 'artifact-resolved',
            artifact: {
              ...a,
              stage: 'closing',
              bubbleIndex: 0,
              focus: closingFocus,
              activeMolecule: closing[0]?.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(closingFocus)),
              activePanel: null,
            },
          }
        }
        return arc
      }),
    )
  }, [])

  const retreatArtifact = useCallback(() => {
    setState((s) =>
      withActiveArc(s, (arc) => {
        const a = arc.artifact
        if (!a) return arc
        // Within-stage retreat: just decrement.
        if (a.bubbleIndex > 0) {
          const bubbles = bubblesForStage(a.stage, a.prediction1, a.prediction2)
          const prevIndex = a.bubbleIndex - 1
          const prevBubble = bubbles[prevIndex]
          const prevFocus = prevBubble.focus ?? a.focus
          return {
            ...arc,
            artifact: {
              ...a,
              bubbleIndex: prevIndex,
              focus: prevFocus,
              activeMolecule: prevBubble.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(prevFocus)),
              activePanel: null,
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
        if (!prevStage) return arc
        // Predict stages don't have bubbles — derive the focus from the stage
        // identity so retreating into them clears stale answer overlays.
        if (prevStage === 'predict-1' || prevStage === 'predict-2') {
          const focus: FocusState = prevStage === 'predict-1' ? 'predict-spatial' : 'predict-tshape'
          return {
            ...arc,
            artifact: {
              ...a,
              stage: prevStage,
              bubbleIndex: 0,
              focus,
              activeMolecule: 'xef2',
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(focus)),
              activePanel: null,
            },
          }
        }
        const prevBubbles = bubblesForStage(prevStage, a.prediction1, a.prediction2)
        const prevIndex = Math.max(0, prevBubbles.length - 1)
        const prevBubble = prevBubbles[prevIndex]
        const prevFocus = prevBubble?.focus ?? a.focus
        return {
          ...arc,
          artifact: {
            ...a,
            stage: prevStage,
            bubbleIndex: prevIndex,
            focus: prevFocus,
            activeMolecule: prevBubble?.molecule ?? a.activeMolecule,
            chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(prevFocus)),
            activePanel: null,
          },
        }
      }),
    )
  }, [])

  const recordPrediction1 = useCallback(
    (input: { optionId?: Prediction1Key; freeText?: string }) => {
      setState((s) =>
        withActiveArc(s, (arc) => {
          const a = arc.artifact
          if (!a) return arc
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
            ...arc,
            artifact: {
              ...a,
              prediction1,
              stage: 'reveal-1',
              bubbleIndex: 0,
              focus: nextFocus,
              activeMolecule: first?.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(nextFocus)),
              activePanel: null,
            },
          }
        }),
      )
    },
    [],
  )

  const recordPrediction2 = useCallback(
    (input: { optionId?: Prediction2Key; freeText?: string }) => {
      setState((s) =>
        withActiveArc(s, (arc) => {
          const a = arc.artifact
          if (!a) return arc
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
            ...arc,
            artifact: {
              ...a,
              prediction2,
              stage: 'reveal-2',
              bubbleIndex: 0,
              focus: nextFocus,
              activeMolecule: first?.molecule ?? a.activeMolecule,
              chipState: applyChipUpdates(a.chipState, chipUpdatesForFocus(nextFocus)),
              activePanel: null,
            },
          }
        }),
      )
    },
    [],
  )

  const closeArtifact = useCallback(() => {
    const arc = getActiveArc(stateRef.current)
    if (!arc.chatId || !arc.conceptId) return
    const chatId = arc.chatId
    const conceptId = arc.conceptId

    // Snapshot what she did inside the artifact BEFORE flipping state — the
    // wrapper-followup beat treats the artifact as closed, but we still want
    // its final interaction state to inform the follow-up.
    const artifactInteraction = buildInteractionSummary(arc.artifact)

    setState((s) => withActiveArc(s, (a) => ({ ...a, beat: 'wrapper-followup' })))

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
      body: {
        conceptId,
        messages: apiMessages,
        afterLearning: true,
        artifactInteraction,
      },
    }).catch(() => {
      /* already logged in chat-store */
    })
  }, [streamCompletion])

  const toggleChip = useCallback((key: ChipKey) => {
    setState((s) =>
      withActiveArc(s, (arc) => {
        const a = arc.artifact
        if (!a) return arc
        return {
          ...arc,
          artifact: { ...a, chipState: { ...a.chipState, [key]: !a.chipState[key] } },
        }
      }),
    )
  }, [])

  const setChip = useCallback((key: ChipKey, value: boolean) => {
    setState((s) =>
      withActiveArc(s, (arc) => {
        const a = arc.artifact
        if (!a) return arc
        return {
          ...arc,
          artifact: { ...a, chipState: { ...a.chipState, [key]: value } },
        }
      }),
    )
  }, [])

  const clickPanel = useCallback((id: RepresentationPanelId) => {
    setState((s) =>
      withActiveArc(s, (arc) => {
        const a = arc.artifact
        if (!a) return arc
        const activePanel =
          id === 'materials' ? a.activePanel : a.activePanel === id ? null : id
        const panelsExplored = a.panelsExplored.includes(id)
          ? a.panelsExplored
          : [...a.panelsExplored, id]
        return { ...arc, artifact: { ...a, activePanel, panelsExplored } }
      }),
    )
  }, [])

  const addRotation = useCallback((deltaRad: number) => {
    if (!Number.isFinite(deltaRad) || deltaRad <= 0) return
    setState((s) =>
      withActiveArc(s, (arc) => {
        const a = arc.artifact
        if (!a) return arc
        if (a.rotationRad >= ROTATION_GATE_RAD) return arc
        const next = Math.min(a.rotationRad + deltaRad, ROTATION_GATE_RAD)
        if (next === a.rotationRad) return arc
        return { ...arc, artifact: { ...a, rotationRad: next } }
      }),
    )
  }, [])

  // Expose `arc` as a computed field on state so existing consumers keep
  // reading `state.arc.X` unchanged. It always resolves to the active chat's
  // arc (or EMPTY_ARC when no chat is selected).
  const exposedState = useMemo(
    () => ({ ...state, arc: getActiveArc(state) }),
    [state],
  )

  const value = useMemo<PrototypeStore>(
    () => ({
      state: exposedState,
      resetArc,
      setCurrentChatId,
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
      exposedState,
      resetArc,
      setCurrentChatId,
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
