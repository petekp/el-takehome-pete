import { CONCEPTS, type ConceptId } from './concepts'
import {
  classifyPrediction1FreeText,
  classifyPrediction2FreeText,
  CLOSING_BUBBLE,
  OPENING_BUBBLES,
  REVEAL_1_PATHS,
  REVEAL_2_PATHS,
  type Bubble,
  type ElementCue,
  type FocusState,
  type Molecule,
  type Prediction1Key,
  type Prediction2Key,
} from './artifact-script'
import type { ImageAttachment } from './types'

export type ArcPath = 'wrapper' | 'learning'

export type ArcBeat =
  | 'idle'
  | 'choosing'
  | 'wrapper-response'
  | 'artifact-active'
  | 'artifact-resolved'
  | 'wrapper-followup'

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
  rotationRad: number
  panelsExplored: RepresentationPanelId[]
  activePanel: RepresentationPanelId | null
  prediction1: ArtifactPrediction1 | null
  prediction2: ArtifactPrediction2 | null
  userAttachments: ImageAttachment[]
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

export type PrototypeState = {
  arcs: Record<string, ArcState>
  currentChatId: string | null
}

export const VALID_CONCEPT_IDS = new Set<string>(CONCEPTS.map((c) => c.id))
const VALID_ARC_BEATS = new Set<ArcBeat>([
  'idle',
  'choosing',
  'wrapper-response',
  'artifact-active',
  'artifact-resolved',
  'wrapper-followup',
])
const VALID_ARC_PATHS = new Set<ArcPath>(['wrapper', 'learning'])
const VALID_ARTIFACT_STAGES = new Set<ArtifactStage>([
  'opening',
  'predict-1',
  'reveal-1',
  'predict-2',
  'reveal-2',
  'closing',
])
const VALID_FOCUS_STATES = new Set<FocusState>([
  'default',
  'materials',
  'equatorial-reveal',
  'predict-spatial',
  'axial-strain',
  'axial-bond-angle',
  'predict-tshape',
  'clf3-tshape',
  'closing',
])
const VALID_MOLECULES = new Set<Molecule>(['xef2', 'xef2-axial-strain', 'clf3'])
const VALID_PANELS = new Set<RepresentationPanelId>(['materials', 'lewis', 'geometry'])
const VALID_PREDICTION_1_KEYS = new Set<Prediction1Key>([
  'notational',
  'equatorial',
  'atoms-push',
  'counting',
  'blocking',
  'idk',
  'unclassified',
])
const VALID_PREDICTION_2_KEYS = new Set<Prediction2Key>([
  'linear',
  'tshape',
  'pyramidal',
  'unclassified',
])

export function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && VALID_CONCEPT_IDS.has(value)
}

export function createDefaultChipState(): ChipState {
  return {
    bonds: true,
    lonePairs: true,
    equatorialPlane: false,
    angles: false,
  }
}

export function createEmptyArtifact(
  overrides: Partial<ArtifactState> = {},
): ArtifactState {
  return {
    stage: 'opening',
    bubbleIndex: 0,
    focus: 'materials',
    activeMolecule: 'xef2',
    chipState: createDefaultChipState(),
    rotationRad: 0,
    panelsExplored: [],
    activePanel: null,
    prediction1: null,
    prediction2: null,
    userAttachments: [],
    openedAt: 0,
    ...overrides,
  }
}

export function createEmptyArc(overrides: Partial<ArcState> = {}): ArcState {
  return {
    beat: 'idle',
    path: null,
    conceptId: null,
    chatId: null,
    triggerMessageId: null,
    affordanceMessageId: null,
    artifactMessageId: null,
    artifact: null,
    ...overrides,
  }
}

export function createInitialPrototypeState(
  overrides: Partial<PrototypeState> = {},
): PrototypeState {
  return {
    arcs: {},
    currentChatId: null,
    ...overrides,
  }
}

export function getActiveArc(s: PrototypeState): ArcState {
  if (!s.currentChatId) return createEmptyArc()
  return s.arcs[s.currentChatId] ?? createEmptyArc()
}

export function updateArcById(
  s: PrototypeState,
  chatId: string,
  updater: (arc: ArcState) => ArcState,
): PrototypeState {
  const current = s.arcs[chatId] ?? createEmptyArc({ chatId })
  const next = updater(current)
  if (next === current) return s
  return { ...s, arcs: { ...s.arcs, [chatId]: next } }
}

export function prepareArtifactClose(
  s: PrototypeState,
  chatId: string,
): { state: PrototypeState; arc: ArcState } | null {
  const arc = s.arcs[chatId]
  if (!arc?.chatId || !arc.conceptId) return null
  return {
    arc,
    state: updateArcById(s, chatId, (a) => ({ ...a, beat: 'wrapper-followup' })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nonNegativeNumber(value: unknown, fallback = 0, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(value as number, max))
}

function integerAtLeastZero(value: unknown, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value as number))
}

function normalizeChipState(value: unknown): ChipState {
  const base = createDefaultChipState()
  if (!isRecord(value)) return base
  return {
    bonds: typeof value.bonds === 'boolean' ? value.bonds : base.bonds,
    lonePairs: typeof value.lonePairs === 'boolean' ? value.lonePairs : base.lonePairs,
    equatorialPlane:
      typeof value.equatorialPlane === 'boolean'
        ? value.equatorialPlane
        : base.equatorialPlane,
    angles: typeof value.angles === 'boolean' ? value.angles : base.angles,
  }
}

function normalizePanelsExplored(value: unknown): RepresentationPanelId[] {
  if (!Array.isArray(value)) return []
  const panels: RepresentationPanelId[] = []
  for (const item of value) {
    if (VALID_PANELS.has(item as RepresentationPanelId) && !panels.includes(item)) {
      panels.push(item)
    }
  }
  return panels
}

function normalizePrediction1(value: unknown): ArtifactPrediction1 | null {
  if (!isRecord(value) || !VALID_PREDICTION_1_KEYS.has(value.key as Prediction1Key)) {
    return null
  }
  const optionId = VALID_PREDICTION_1_KEYS.has(value.optionId as Prediction1Key)
    ? (value.optionId as Prediction1Key)
    : undefined
  const freeText = typeof value.freeText === 'string' ? value.freeText : undefined
  return { key: value.key as Prediction1Key, optionId, freeText }
}

function normalizePrediction2(value: unknown): ArtifactPrediction2 | null {
  if (!isRecord(value) || !VALID_PREDICTION_2_KEYS.has(value.key as Prediction2Key)) {
    return null
  }
  const optionId = VALID_PREDICTION_2_KEYS.has(value.optionId as Prediction2Key)
    ? (value.optionId as Prediction2Key)
    : undefined
  const freeText = typeof value.freeText === 'string' ? value.freeText : undefined
  return { key: value.key as Prediction2Key, optionId, freeText }
}

function normalizeUserAttachments(value: unknown): ImageAttachment[] {
  if (!Array.isArray(value)) return []
  return value.filter((att): att is ImageAttachment => {
    if (!isRecord(att)) return false
    return (
      typeof att.id === 'string' &&
      typeof att.name === 'string' &&
      typeof att.data === 'string' &&
      (att.mediaType === 'image/jpeg' ||
        att.mediaType === 'image/png' ||
        att.mediaType === 'image/webp' ||
        att.mediaType === 'image/gif')
    )
  })
}

function normalizeArtifact(value: unknown): ArtifactState | null {
  if (!isRecord(value)) return null
  const defaults = createEmptyArtifact()
  const stage = VALID_ARTIFACT_STAGES.has(value.stage as ArtifactStage)
    ? (value.stage as ArtifactStage)
    : defaults.stage
  const focus = VALID_FOCUS_STATES.has(value.focus as FocusState)
    ? (value.focus as FocusState)
    : defaults.focus
  const activeMolecule = VALID_MOLECULES.has(value.activeMolecule as Molecule)
    ? (value.activeMolecule as Molecule)
    : defaults.activeMolecule
  const activePanel = VALID_PANELS.has(value.activePanel as RepresentationPanelId)
    ? (value.activePanel as RepresentationPanelId)
    : null

  return createEmptyArtifact({
    stage,
    bubbleIndex: integerAtLeastZero(value.bubbleIndex),
    focus,
    activeMolecule,
    chipState: normalizeChipState(value.chipState),
    rotationRad: nonNegativeNumber(value.rotationRad, 0, ROTATION_GATE_RAD),
    panelsExplored: normalizePanelsExplored(value.panelsExplored),
    activePanel,
    prediction1: normalizePrediction1(value.prediction1),
    prediction2: normalizePrediction2(value.prediction2),
    userAttachments: normalizeUserAttachments(value.userAttachments),
    openedAt: nonNegativeNumber(value.openedAt),
  })
}

function normalizeArc(value: unknown, fallbackChatId: string): ArcState | null {
  if (!isRecord(value)) return null
  if (value.conceptId !== null && value.conceptId !== undefined && !isConceptId(value.conceptId)) {
    return null
  }
  const beat = VALID_ARC_BEATS.has(value.beat as ArcBeat)
    ? (value.beat as ArcBeat)
    : 'idle'
  const path = VALID_ARC_PATHS.has(value.path as ArcPath)
    ? (value.path as ArcPath)
    : null
  return createEmptyArc({
    beat,
    path,
    conceptId: isConceptId(value.conceptId) ? value.conceptId : null,
    chatId: stringOrNull(value.chatId) ?? fallbackChatId,
    triggerMessageId: stringOrNull(value.triggerMessageId),
    affordanceMessageId: stringOrNull(value.affordanceMessageId),
    artifactMessageId: stringOrNull(value.artifactMessageId),
    artifact: normalizeArtifact(value.artifact),
  })
}

export function normalizePrototypeState(value: unknown): PrototypeState {
  if (!isRecord(value) || !isRecord(value.arcs)) return createInitialPrototypeState()

  const arcs: Record<string, ArcState> = {}
  for (const [chatId, arc] of Object.entries(value.arcs)) {
    const normalized = normalizeArc(arc, chatId)
    if (normalized) arcs[chatId] = normalized
  }

  const currentChatId =
    typeof value.currentChatId === 'string' && value.currentChatId in arcs
      ? value.currentChatId
      : null

  return { arcs, currentChatId }
}

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

export const ROTATION_GATE_RAD = Math.PI / 2

export const LITERACY_PANELS: RepresentationPanelId[] = ['lewis', 'geometry']

export function activeCue(artifact: ArtifactState | null): ElementCue | null {
  if (!artifact) return null
  const bubble = bubblesForStage(
    artifact.stage,
    artifact.prediction1,
    artifact.prediction2,
  )[artifact.bubbleIndex]
  return bubble?.cue ?? null
}

function chipUpdatesForFocus(focus: FocusState): Partial<ChipState> {
  switch (focus) {
    case 'materials':
      return { lonePairs: true, equatorialPlane: false, angles: false }
    case 'equatorial-reveal':
      return { lonePairs: true, equatorialPlane: true, angles: false }
    case 'predict-spatial':
      return { lonePairs: true, equatorialPlane: false, angles: false }
    case 'axial-strain':
      return { lonePairs: true, equatorialPlane: true, angles: false }
    case 'axial-bond-angle':
      return { lonePairs: true, equatorialPlane: false, angles: true }
    case 'predict-tshape':
      return { lonePairs: true, equatorialPlane: false, angles: false }
    case 'clf3-tshape':
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

function updateArtifact(
  arc: ArcState,
  updater: (artifact: ArtifactState) => ArtifactState,
): ArcState {
  if (!arc.artifact) return arc
  const artifact = updater(arc.artifact)
  if (artifact === arc.artifact) return arc
  return { ...arc, artifact }
}

function applyBubble(
  artifact: ArtifactState,
  bubble: Bubble | undefined,
  bubbleIndex: number,
  fallbackFocus: FocusState = artifact.focus,
): ArtifactState {
  const focus = bubble?.focus ?? fallbackFocus
  return {
    ...artifact,
    bubbleIndex,
    focus,
    activeMolecule: bubble?.molecule ?? artifact.activeMolecule,
    chipState: applyChipUpdates(artifact.chipState, chipUpdatesForFocus(focus)),
    activePanel: null,
  }
}

function enterPredictStage(
  artifact: ArtifactState,
  stage: Extract<ArtifactStage, 'predict-1' | 'predict-2'>,
): ArtifactState {
  const focus: FocusState = stage === 'predict-1' ? 'predict-spatial' : 'predict-tshape'
  return {
    ...artifact,
    stage,
    bubbleIndex: 0,
    focus,
    activeMolecule: 'xef2',
    chipState: applyChipUpdates(artifact.chipState, chipUpdatesForFocus(focus)),
    activePanel: null,
  }
}

function enterBubbleStage(artifact: ArtifactState, stage: ArtifactStage): ArtifactState {
  const bubbles = bubblesForStage(stage, artifact.prediction1, artifact.prediction2)
  const first = bubbles[0]
  return {
    ...applyBubble(artifact, first, 0),
    stage,
  }
}

export function advanceArtifactArc(arc: ArcState): ArcState {
  const artifact = arc.artifact
  if (!artifact) return arc
  const bubbles = bubblesForStage(
    artifact.stage,
    artifact.prediction1,
    artifact.prediction2,
  )

  const nextIndex = artifact.bubbleIndex + 1
  if (nextIndex < bubbles.length) {
    return {
      ...arc,
      artifact: applyBubble(artifact, bubbles[nextIndex], nextIndex),
    }
  }

  if (artifact.stage === 'opening') {
    return { ...arc, artifact: enterPredictStage(artifact, 'predict-1') }
  }
  if (artifact.stage === 'reveal-1') {
    return { ...arc, artifact: enterPredictStage(artifact, 'predict-2') }
  }
  if (artifact.stage === 'reveal-2') {
    return {
      ...arc,
      beat: 'artifact-resolved',
      artifact: enterBubbleStage(artifact, 'closing'),
    }
  }
  return arc
}

export function retreatArtifactArc(arc: ArcState): ArcState {
  const artifact = arc.artifact
  if (!artifact) return arc

  if (artifact.bubbleIndex > 0) {
    const bubbles = bubblesForStage(
      artifact.stage,
      artifact.prediction1,
      artifact.prediction2,
    )
    const prevIndex = artifact.bubbleIndex - 1
    return {
      ...arc,
      artifact: applyBubble(artifact, bubbles[prevIndex], prevIndex),
    }
  }

  const prevStage: ArtifactStage | null =
    artifact.stage === 'predict-1'
      ? 'opening'
      : artifact.stage === 'reveal-1'
        ? 'predict-1'
        : artifact.stage === 'predict-2'
          ? 'reveal-1'
          : artifact.stage === 'reveal-2'
            ? 'predict-2'
            : artifact.stage === 'closing'
              ? 'reveal-2'
              : null
  if (!prevStage) return arc

  if (prevStage === 'predict-1' || prevStage === 'predict-2') {
    return { ...arc, artifact: enterPredictStage(artifact, prevStage) }
  }

  const prevBubbles = bubblesForStage(
    prevStage,
    artifact.prediction1,
    artifact.prediction2,
  )
  const prevIndex = Math.max(0, prevBubbles.length - 1)
  return {
    ...arc,
    artifact: {
      ...applyBubble(artifact, prevBubbles[prevIndex], prevIndex),
      stage: prevStage,
    },
  }
}

export function recordPrediction1InArc(
  arc: ArcState,
  input: { optionId?: Prediction1Key; freeText?: string },
): ArcState {
  return updateArtifact(arc, (artifact) => {
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
    return {
      ...applyBubble({ ...artifact, prediction1 }, reveal1[0], 0),
      stage: 'reveal-1',
    }
  })
}

export function recordPrediction2InArc(
  arc: ArcState,
  input: { optionId?: Prediction2Key; freeText?: string },
): ArcState {
  return updateArtifact(arc, (artifact) => {
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
    return {
      ...applyBubble({ ...artifact, prediction2 }, reveal2[0], 0),
      stage: 'reveal-2',
    }
  })
}

export function resetArtifactInArc(arc: ArcState, openedAt: number = Date.now()): ArcState {
  const userAttachments = arc.artifact?.userAttachments ?? []
  return {
    ...arc,
    beat: 'artifact-active',
    artifact: createEmptyArtifact({ userAttachments, openedAt }),
  }
}

export function toggleChipInArc(arc: ArcState, key: ChipKey): ArcState {
  return updateArtifact(arc, (artifact) => ({
    ...artifact,
    chipState: { ...artifact.chipState, [key]: !artifact.chipState[key] },
  }))
}

export function setChipInArc(arc: ArcState, key: ChipKey, value: boolean): ArcState {
  return updateArtifact(arc, (artifact) => ({
    ...artifact,
    chipState: { ...artifact.chipState, [key]: value },
  }))
}

export function clickPanelInArc(arc: ArcState, id: RepresentationPanelId): ArcState {
  return updateArtifact(arc, (artifact) => {
    const activePanel =
      id === 'materials'
        ? artifact.activePanel
        : artifact.activePanel === id
          ? null
          : id
    const panelsExplored = artifact.panelsExplored.includes(id)
      ? artifact.panelsExplored
      : [...artifact.panelsExplored, id]
    return { ...artifact, activePanel, panelsExplored }
  })
}

export function addRotationToArc(arc: ArcState, deltaRad: number): ArcState {
  if (!Number.isFinite(deltaRad) || deltaRad <= 0) return arc
  return updateArtifact(arc, (artifact) => {
    if (artifact.rotationRad >= ROTATION_GATE_RAD) return artifact
    const rotationRad = Math.min(artifact.rotationRad + deltaRad, ROTATION_GATE_RAD)
    if (rotationRad === artifact.rotationRad) return artifact
    return { ...artifact, rotationRad }
  })
}
