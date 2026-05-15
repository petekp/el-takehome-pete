'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Expand,
  Maximize2,
  Minimize2,
  Share2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  activeCue,
  bubblesForStage,
  gateProgress,
  PREDICTION_1,
  PREDICTION_2,
  usePrototypeStore,
  type ArtifactPrediction1,
  type ArtifactPrediction2,
  type ArtifactStage,
  type ArtifactState,
} from '@/lib/prototype-store'
import {
  RESOURCES,
  SUMMARY_CARD,
  type Bubble,
  type PredictionOption,
  type Prediction1Key,
  type Prediction2Key,
} from '@/lib/artifact-script'
import { ControlChip, ControlPane } from './ControlPane'
import {
  LonePairSlider,
  MoleculeScene,
  lpShapeLabel,
  moleculeNaturalLpCount,
} from './MoleculeScene'
import { MaterialsLightbox, PanelDiagram, RepresentationPanels } from './RepresentationPanels'
import type { ImageAttachment } from '@/lib/types'

/**
 * The inline artifact — the single core surface the prototype is built
 * around.
 *
 * v4 polish: the right pane became a state machine. At any moment it shows
 * exactly one of:
 *   - Bubble state  (an active bubble, centered with breathing room)
 *   - Predict state (the prediction question + options + free-text)
 *   - Reveal state  (the first bubble of the reveal sequence, plus a
 *                    "You said" attribution chip)
 *   - Closing state (the closing bubble + summary card + resources + Done)
 *
 * Below it sits a persistent stepper: Back / position / Next. Guided
 * interaction beats add a gate-progress line above the stepper plus a
 * "Skip this and keep going" link after a 10s delay.
 *
 * The header carries only the title and a small button cluster (References,
 * Summary, Close). Both References and Summary open lightweight overlays
 * accessible at any time during the arc.
 */

// Beats per stage are constant across all prediction branches: 5 + 1 + 3 + 1 + 2 + 1
const TOTAL_BEATS = 13
const STAGE_OFFSET: Record<ArtifactStage, number> = {
  opening: 0,
  'predict-1': 5,
  'reveal-1': 6,
  'predict-2': 9,
  'reveal-2': 10,
  closing: 12,
}

// Right-pane carousel transition. `direction` is read off AnimatePresence's
// custom prop so the outgoing step slides toward the side the new step came
// from, while the incoming step slides in from the opposite side. The exit
// opacity uses its own faster duration so the outgoing content clears out
// quickly and doesn't visually compete with the incoming content during the
// horizontal slide.
const STEP_SLIDE_PX = 36
type StepDirection = 'forward' | 'back'
const stepSlideVariants: Variants = {
  enter: (dir: StepDirection) => ({
    x: dir === 'back' ? -STEP_SLIDE_PX : STEP_SLIDE_PX,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: StepDirection) => ({
    x: dir === 'back' ? STEP_SLIDE_PX : -STEP_SLIDE_PX,
    opacity: 0,
    transition: {
      x: { type: 'spring' as const, stiffness: 320, damping: 34, mass: 0.7 },
      opacity: { duration: 0.08, ease: 'easeOut' as const },
    },
  }),
}

function positionInArc(stage: ArtifactStage, bubbleIndex: number): number {
  return STAGE_OFFSET[stage] + bubbleIndex + 1
}

type LiteracyPanel = 'lewis' | 'wedge' | 'geometry'

function panelDisplayLabel(panel: ArtifactState['activePanel']): string {
  if (panel === 'lewis') return 'Lewis'
  if (panel === 'wedge') return 'Wedge-and-dash'
  if (panel === 'geometry') return 'Geometry'
  if (panel === 'materials') return 'Materials'
  return 'None'
}

export function Artifact() {
  const {
    state,
    advanceArtifact,
    retreatArtifact,
    recordPrediction1,
    recordPrediction2,
    closeArtifact,
    addRotation,
    clickPanel,
  } = usePrototypeStore()
  const arc = state.arc
  const artifact = arc.artifact

  const [referencesOpen, setReferencesOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<LiteracyPanel | null>(null)

  // Continuous lone-pair count drives the parameterized 5-domain morph. Lives
  // here (not inside MoleculeScene) so the slider can sit next to the
  // representation toggle group in the same container at the viewport edge.
  const activeMolecule = artifact?.activeMolecule
  const [lpCount, setLpCount] = useState<number>(
    activeMolecule ? moleculeNaturalLpCount(activeMolecule) : 3,
  )
  const [trackedMolecule, setTrackedMolecule] = useState(activeMolecule)
  if (activeMolecule && activeMolecule !== trackedMolecule) {
    setTrackedMolecule(activeMolecule)
    setLpCount(moleculeNaturalLpCount(activeMolecule))
  }

  // Reset expansion whenever the active panel changes underneath (panel
  // deactivated, switched to another literacy panel, etc.) so we never end
  // up with an expanded overlay for a panel that isn't even active. Uses the
  // React derived-state pattern: a tracked prop value triggers a render-time
  // state reset when the prop changes.
  const [prevActivePanel, setPrevActivePanel] = useState(artifact?.activePanel)
  if (artifact?.activePanel !== prevActivePanel) {
    setPrevActivePanel(artifact?.activePanel)
    if (
      expandedPanel &&
      (artifact?.activePanel !== expandedPanel ||
        (artifact?.activePanel !== 'lewis' &&
          artifact?.activePanel !== 'wedge' &&
          artifact?.activePanel !== 'geometry'))
    ) {
      setExpandedPanel(null)
    }
  }

  useEffect(() => {
    if (!referencesOpen && !summaryOpen && !materialsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReferencesOpen(false)
        setSummaryOpen(false)
        setMaterialsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [referencesOpen, summaryOpen, materialsOpen])

  if (!artifact || arc.beat === 'idle') {
    return <ArtifactCollapsed />
  }

  // After the user closes the artifact and we've moved to wrapper-followup,
  // freeze the artifact at the closing state — it stays viewable as a
  // record of what just happened.
  const interactive = arc.beat === 'artifact-active' || arc.beat === 'artifact-resolved'
  const summaryAvailable = artifact.prediction1 !== null

  return (
    <section
      className={cn(
        'border-border-subtle bg-surface my-4 overflow-hidden rounded-lg border shadow-sm',
        'relative',
      )}
      aria-label="Molecular geometry explainer"
    >
      {/* The artifact is one full-bleed 3D viewport with the header, the
          right pane, and the representation-panels row floating on top of
          it. MoleculeScene takes top/right/bottom inset values so its
          safe-area math knows where the overlays sit and can center +
          zoom the molecule into the remaining visible region. */}
      <div className="relative h-[480px] max-h-[calc(100dvh-var(--header-height)-var(--composer-height)-90px)] overflow-hidden">
        <MoleculeScene
          molecule={artifact.activeMolecule}
          chipState={artifact.chipState}
          activePanel={artifact.activePanel}
          lpCount={lpCount}
          onRotationDelta={addRotation}
          onExitTreatment={
            artifact.activePanel ? () => clickPanel(artifact.activePanel!) : undefined
          }
          topOverlayInsetPx={64}
          rightOverlayInsetPx={344}
          bottomOverlayInsetPx={64}
          className="absolute inset-0"
        />

        <Header
          title="Why XeF₂ is linear"
          attachments={artifact.userAttachments}
          cuePulse={activeCue(artifact) === 'panel-materials'}
          onOpenMaterials={() => setMaterialsOpen(true)}
          onReferences={() => setReferencesOpen(true)}
        />

        <ViewportCue artifact={artifact} />

        {/* Bottom-of-viewport control pane. Each chip surfaces a label +
            current value and reveals the actual control on hover. The
            container is positioned to stop short of the floating right pane
            so popovers don't slip behind it. The lone-pair chip is hidden
            for the axial-strain preset (non-equilibrium configuration the
            parameterized builder can't reproduce). */}
        <ControlPane className="absolute bottom-3 left-3 z-10">
          <ControlChip
            label="View"
            value={panelDisplayLabel(artifact.activePanel)}
            popoverClassName="rounded-lg p-1"
          >
            <RepresentationPanels />
          </ControlChip>
          {artifact.activeMolecule !== 'xef2-axial-strain' && (
            <ControlChip
              label="Lone pairs"
              value={`${lpCount.toFixed(1)} · ${lpShapeLabel(lpCount)}`}
            >
              <LonePairSlider value={lpCount} onChange={setLpCount} />
            </ControlChip>
          )}
        </ControlPane>

        {/* Right pane as a translucent panel on top of the visualization. */}
        <aside
          className={cn(
            'absolute bottom-3 right-3 top-[60px] z-10 flex w-[324px] flex-col',
            'bg-page/97 border-border-subtle overflow-hidden rounded-md border',
            'backdrop-blur-md',
          )}
        >
          <RightPane
            artifact={artifact}
            interactive={interactive}
            expandedPanel={expandedPanel}
            onExpandPanel={setExpandedPanel}
            onAdvance={advanceArtifact}
            onRetreat={retreatArtifact}
            onSubmitPrediction1={recordPrediction1}
            onSubmitPrediction2={recordPrediction2}
            onClose={closeArtifact}
            onOpenSummary={() => setSummaryOpen(true)}
            onOpenReferences={() => setReferencesOpen(true)}
          />
          {/* Expanded-diagram clone overlays the entire right-pane card —
              including the stepper / gate footer — via motion's layoutId
              animation. The thumbnail inside the bubble stays in flow with
              opacity 0 so content position never shifts. */}
          <AnimatePresence>
            {expandedPanel && (
              <motion.div
                key={`expanded-${expandedPanel}`}
                layoutId={`panel-diagram-${expandedPanel}`}
                transition={{ type: 'spring', stiffness: 280, damping: 32, mass: 0.7 }}
                className={cn(
                  'bg-surface/95 absolute inset-0 z-30 flex flex-col items-center',
                  'justify-center gap-3 p-6 backdrop-blur-sm',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpandedPanel(null)}
                  aria-label="Collapse diagram"
                  className={cn(
                    'text-text-tertiary hover:text-text-secondary hover:bg-state-hover',
                    'absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md',
                    'transition-colors',
                  )}
                >
                  <Minimize2 className="size-4" />
                </button>
                <PanelDiagram
                  panel={expandedPanel}
                  molecule={artifact.activeMolecule}
                  expanded
                />
                <figcaption className="text-text-tertiary font-serif text-[14px] italic">
                  {expandedPanel === 'lewis'
                    ? 'Lewis structure'
                    : expandedPanel === 'wedge'
                      ? 'Wedge-and-dash'
                      : 'Geometry chart'}
                </figcaption>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      {referencesOpen && <ReferencesOverlay onClose={() => setReferencesOpen(false)} />}
      {summaryOpen && summaryAvailable && (
        <SummaryOverlay onClose={() => setSummaryOpen(false)} />
      )}
      {materialsOpen && (
        <MaterialsLightbox
          attachments={artifact.userAttachments}
          onClose={() => setMaterialsOpen(false)}
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  title,
  attachments,
  cuePulse,
  onOpenMaterials,
  onReferences,
}: {
  title: string
  attachments: ImageAttachment[]
  cuePulse: boolean
  onOpenMaterials: () => void
  onReferences: () => void
}) {
  return (
    <header
      className={cn(
        'border-border-soft absolute left-0 right-0 top-0 z-20 flex items-center',
        'justify-between gap-3 border-b px-4 py-2.5',
        'bg-surface/85 backdrop-blur-md',
      )}
    >
      <h3 className="text-text-primary min-w-0 truncate font-serif text-base font-medium">{title}</h3>
      <div className="flex items-center gap-2">
        <MaterialsHeaderStack
          attachments={attachments}
          cuePulse={cuePulse}
          onClick={onOpenMaterials}
        />
        <div className="flex items-center gap-1">
          <HeaderLabeledButton label="Resources" onClick={onReferences}>
            <BookOpen className="size-3.5" />
          </HeaderLabeledButton>
          <HeaderIconButton label="Share" onClick={() => {}}>
            <Share2 className="size-3.5" />
          </HeaderIconButton>
          <HeaderIconButton label="Fullscreen" onClick={() => {}}>
            <Expand className="size-3.5" />
          </HeaderIconButton>
        </div>
      </div>
    </header>
  )
}

/**
 * Stacked-paper thumbnail control in the artifact header. Three thumbnails
 * max, fanned out with small rotations so the stack reads as "papers". The
 * whole control opens the materials lightbox. Pulses when the bubble script
 * broadcasts the 'panel-materials' cue (e.g. opening beat 1).
 */
function MaterialsHeaderStack({
  attachments,
  cuePulse,
  onClick,
}: {
  attachments: ImageAttachment[]
  cuePulse: boolean
  onClick: () => void
}) {
  if (attachments.length === 0) return null
  const visible = attachments.slice(0, 3)
  // Per-card geometry — base layout fans the stack (leftmost tilts left,
  // rightmost tilts right). On hover, the outer cards spread further from
  // center and rotate a touch more, like a hand of cards being splayed.
  const center = (visible.length - 1) / 2
  // Cards are size-9 inside a h-7 button so they overhang the button bounds
  // top + bottom, giving the stack a "papers spilling out" feel.
  const CARD_PX = 36
  const REST_OFFSET = 9
  const REST_ROT = 7
  const SPREAD = 9
  const HOVER_ROT = 16
  const stackTransition = { type: 'spring' as const, stiffness: 320, damping: 20, mass: 0.5 }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Open your materials"
      initial="rest"
      whileHover="hover"
      animate="rest"
      className={cn(
        'group relative inline-flex h-7 items-center gap-1.5 rounded-md px-2',
        'hover:bg-state-hover transition-colors',
      )}
    >
      <span
        // -my-1 lets the size-9 cards overhang the h-7 button vertically.
        // Width is fixed at the rest size so the deck-spread on hover
        // animates the cards in place — the rightmost overhangs visually
        // without pushing the "Attachments" label right.
        className="relative -my-1 inline-flex h-9 shrink-0"
        style={{ width: CARD_PX + (visible.length - 1) * REST_OFFSET }}
      >
        {visible.map((a, idx) => {
          const distance = idx - center
          const restX = idx * REST_OFFSET
          const hoverX = restX + distance * SPREAD
          return (
            <motion.img
              key={a.id}
              src={`data:${a.mediaType};base64,${a.data}`}
              alt=""
              aria-hidden
              className="border-border-soft bg-surface absolute inset-y-0 size-9 rounded-sm border object-cover shadow-sm"
              style={{ zIndex: idx }}
              variants={{
                rest: { x: restX, rotate: distance * REST_ROT },
                hover: { x: hoverX, rotate: distance * HOVER_ROT },
              }}
              transition={stackTransition}
            />
          )
        })}
      </span>
      <span className="text-text-secondary group-hover:text-text-primary text-[12px] font-medium">
        Attachments
      </span>
      {cuePulse && (
        <span
          aria-hidden
          className="border-accent/40 bg-accent/8 pointer-events-none absolute -inset-0.5 -z-10 animate-[cuePulse_1600ms_ease-in-out_infinite] rounded-md border"
        />
      )}
    </motion.button>
  )
}

function HeaderIconButton({
  label,
  onClick,
  disabled,
  tooltip,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      title={tooltip ?? label}
      className={cn(
        'text-text-tertiary hover:text-text-secondary hover:bg-state-hover inline-flex size-7',
        'items-center justify-center rounded-md transition-colors',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-text-tertiary',
      )}
    >
      {children}
    </button>
  )
}

function HeaderLabeledButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-text-secondary hover:text-text-primary hover:bg-state-hover inline-flex h-7',
        'items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors',
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Right pane — state machine (bubble / predict / reveal / closing) +
// persistent stepper at bottom.
// ---------------------------------------------------------------------------

type RightPaneProps = {
  artifact: ArtifactState
  interactive: boolean
  expandedPanel: LiteracyPanel | null
  onExpandPanel: (panel: LiteracyPanel | null) => void
  onAdvance: (opts?: { force?: boolean }) => void
  onRetreat: () => void
  onSubmitPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  onSubmitPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  onClose: () => void
  onOpenSummary: () => void
  onOpenReferences: () => void
}

function RightPane({
  artifact,
  interactive,
  expandedPanel,
  onExpandPanel,
  onAdvance,
  onRetreat,
  onSubmitPrediction1,
  onSubmitPrediction2,
  onClose,
  onOpenSummary,
  onOpenReferences,
}: RightPaneProps) {
  const bubbles = bubblesForStage(artifact.stage, artifact.prediction1, artifact.prediction2)
  const currentBubble = bubbles[artifact.bubbleIndex] ?? null
  const isPredict = artifact.stage === 'predict-1' || artifact.stage === 'predict-2'
  const isReveal = artifact.stage === 'reveal-1' || artifact.stage === 'reveal-2'
  const isClosing = artifact.stage === 'closing'
  const isRevealHead = isReveal && artifact.bubbleIndex === 0
  const gate = gateProgress(currentBubble, artifact)
  const gateSatisfied = !gate || gate.satisfied

  // State key drives the in-pane fade transition.
  const stateKey = `${artifact.stage}:${artifact.bubbleIndex}`

  const position = isPredict
    ? STAGE_OFFSET[artifact.stage] + 1
    : positionInArc(artifact.stage, artifact.bubbleIndex)

  const canRetreat = !(artifact.stage === 'opening' && artifact.bubbleIndex === 0)

  // Track navigation direction so the right-pane state content slides in
  // from the right when the user advances and from the left when they go
  // back. Falls through to 'forward' for the very first render. Uses the
  // React derived-state pattern: a tracked previous-position state lets us
  // compute the direction in render and update inline when the prop changes.
  const [prevPosition, setPrevPosition] = useState(position)
  const direction: 'forward' | 'back' = position < prevPosition ? 'back' : 'forward'
  if (position !== prevPosition) {
    setPrevPosition(position)
  }

  return (
    <div className="relative h-full">
      {/* State content. Each step is its own motion.div absolutely positioned
          inside this relative wrapper so the outgoing and incoming steps can
          overlap during the transition. The inner scroll container handles
          vertical overflow when a step's content is taller than the pane,
          and carries extra bottom padding so content fades behind the
          gradient footer rather than colliding with it. */}
      <div className="relative h-full overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={stateKey}
            custom={direction}
            variants={stepSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 320, damping: 34, mass: 0.7 },
              opacity: { duration: 0.18, ease: 'easeOut' },
            }}
            className="no-scrollbar absolute inset-0 overflow-y-auto"
          >
            <div className="flex min-h-full flex-col justify-center px-4 pb-24 pt-5">
              <StateContent
                artifact={artifact}
                currentBubble={currentBubble}
                isPredict={isPredict}
                isRevealHead={isRevealHead}
                isClosing={isClosing}
                interactive={interactive}
                expandedPanel={expandedPanel}
                onExpandPanel={onExpandPanel}
                onSubmitPrediction1={onSubmitPrediction1}
                onSubmitPrediction2={onSubmitPrediction2}
                onClose={onClose}
                onOpenSummary={onOpenSummary}
                onOpenReferences={onOpenReferences}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer overlay. A bottom-anchored linear gradient (solid surface at
          the bottom, transparent at the top) lets the scrolling content fade
          out behind the gate/stepper instead of hitting a hard divider. */}
      <div
        aria-hidden
        className="from-page pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-50% to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0">
        {gate && !gate.satisfied && (
          <div className="text-text-tertiary px-4 py-2 text-[11px]">
            <GateIndicator
              label={gate.label}
              onSkip={interactive ? () => onAdvance({ force: true }) : undefined}
            />
          </div>
        )}
        <Stepper
          canRetreat={canRetreat && interactive}
          canAdvance={interactive && !isPredict && !!currentBubble && gateSatisfied}
          position={position}
          total={TOTAL_BEATS}
          onRetreat={onRetreat}
          onAdvance={onAdvance}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// State content — bubble / predict / reveal / closing
// ---------------------------------------------------------------------------

function StateContent({
  artifact,
  currentBubble,
  isPredict,
  isRevealHead,
  isClosing,
  interactive,
  expandedPanel,
  onExpandPanel,
  onSubmitPrediction1,
  onSubmitPrediction2,
  onClose,
  onOpenSummary,
  onOpenReferences,
}: {
  artifact: ArtifactState
  currentBubble: Bubble | null
  isPredict: boolean
  isRevealHead: boolean
  isClosing: boolean
  interactive: boolean
  expandedPanel: LiteracyPanel | null
  onExpandPanel: (panel: LiteracyPanel | null) => void
  onSubmitPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  onSubmitPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  onClose: () => void
  onOpenSummary: () => void
  onOpenReferences: () => void
}) {
  if (isPredict) {
    return (
      <div className="flex h-full flex-col gap-4">
        {artifact.stage === 'predict-1' && (
          <PredictPanel<Prediction1Key>
            label="Your read"
            framing={PREDICTION_1.framing}
            options={PREDICTION_1.options}
            onSubmit={interactive ? onSubmitPrediction1 : () => {}}
            disabled={!interactive}
          />
        )}
        {artifact.stage === 'predict-2' && (
          <PredictPanel<Prediction2Key>
            label="One more"
            framing={PREDICTION_2.framing}
            options={PREDICTION_2.options}
            onSubmit={interactive ? onSubmitPrediction2 : () => {}}
            disabled={!interactive}
          />
        )}
      </div>
    )
  }

  if (isClosing) {
    return (
      <div className="flex flex-col gap-4">
        {currentBubble && <BubbleCard text={currentBubble.text} />}
        <button
          type="button"
          onClick={onOpenSummary}
          className={cn(
            'border-accent/30 bg-accent/5 hover:bg-accent/10 hover:border-accent/40',
            'text-accent-strong rounded-md border px-3 py-2 text-left text-[12px] font-medium',
            'transition-colors',
          )}
        >
          View takeaway card →
        </button>
        <button
          type="button"
          onClick={onOpenReferences}
          className={cn(
            'border-border-subtle bg-page hover:bg-state-hover',
            'text-text-secondary rounded-md border px-3 py-2 text-left text-[12px]',
            'transition-colors',
          )}
        >
          Go deeper — external resources →
        </button>
        {interactive && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'border-accent/40 bg-accent/10 hover:bg-accent/15',
              'text-accent-strong rounded-md border px-3 py-2 text-[12px] font-medium',
              'mt-1 transition-colors',
            )}
          >
            Done — back to the conversation
          </button>
        )}
      </div>
    )
  }

  // Bubble state (opening / mid-reveal) — render the bubble, with a
  // "You said" attribution chip when we're entering a reveal sequence. If a
  // literacy panel (Lewis / Wedge / Geometry) is active, surface its 2D
  // diagram inline above the bubble: the 3D viewport shows the matching
  // treatment, and the right pane shows the literal 2D representation.
  const literacyPanel =
    artifact.activePanel === 'lewis' ||
    artifact.activePanel === 'wedge' ||
    artifact.activePanel === 'geometry'
      ? artifact.activePanel
      : null

  return (
    <div className="flex flex-col gap-3">
      {isRevealHead && (
        <RevealAttribution
          prediction1={artifact.prediction1}
          prediction2={artifact.prediction2}
          stage={artifact.stage}
        />
      )}
      <AnimatePresence mode="wait" initial={false}>
        {literacyPanel && (
          <PanelDiagramInline
            key={literacyPanel}
            panel={literacyPanel}
            molecule={artifact.activeMolecule}
            isExpanded={expandedPanel === literacyPanel}
            onExpand={() => onExpandPanel(literacyPanel)}
          />
        )}
      </AnimatePresence>
      {currentBubble && <BubbleCard text={currentBubble.text} />}
    </div>
  )
}

function PanelDiagramInline({
  panel,
  molecule,
  isExpanded,
  onExpand,
}: {
  panel: LiteracyPanel
  molecule: ArtifactState['activeMolecule']
  isExpanded: boolean
  onExpand: () => void
}) {
  const label =
    panel === 'lewis' ? 'Lewis structure' : panel === 'wedge' ? 'Wedge-and-dash' : 'Geometry chart'
  // The thumbnail stays in flow at all times (so the bubble underneath
  // doesn't shift when the user expands). Its `layoutId` is shared with the
  // expanded clone overlay rendered up at the aside level — motion uses that
  // to spring the clone from this thumbnail's bounding box on enter, and
  // back to it on exit. We hide the thumbnail visually while expanded so it
  // doesn't draw on top of the animating clone, but it still occupies space.
  return (
    <motion.figure
      layoutId={`panel-diagram-${panel}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: isExpanded ? 0 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        layout: { type: 'spring', stiffness: 280, damping: 32, mass: 0.7 },
        default: { duration: 0.2, ease: 'easeOut' },
      }}
      className="group/figure relative flex w-fit flex-col items-center gap-1.5 self-center"
      aria-label={label}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand diagram"
        className={cn(
          'text-text-tertiary hover:text-text-secondary hover:bg-state-hover',
          'absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-md',
          'opacity-0 transition-opacity group-hover/figure:opacity-100 focus:opacity-100',
        )}
      >
        <Maximize2 className="size-3.5" />
      </button>
      <PanelDiagram panel={panel} molecule={molecule} />
      <figcaption className="text-text-tertiary font-serif text-[12px] italic">
        {label}
      </figcaption>
    </motion.figure>
  )
}

function BubbleCard({ text }: { text: string }) {
  return (
    <p className="text-text-primary font-serif text-[17px] leading-relaxed">{text}</p>
  )
}

function RevealAttribution({
  prediction1,
  prediction2,
  stage,
}: {
  prediction1: ArtifactPrediction1 | null
  prediction2: ArtifactPrediction2 | null
  stage: ArtifactStage
}) {
  const text =
    stage === 'reveal-1'
      ? lookupLabel1(prediction1) ?? prediction1?.freeText ?? ''
      : lookupLabel2(prediction2) ?? prediction2?.freeText ?? ''
  if (!text) return null
  return (
    <p className="text-text-tertiary font-serif text-[15px] italic leading-relaxed">
      “{text}”
    </p>
  )
}

function lookupLabel1(p: ArtifactPrediction1 | null): string | undefined {
  if (!p?.optionId) return undefined
  return PREDICTION_1.options.find((o) => o.id === p.optionId)?.label
}
function lookupLabel2(p: ArtifactPrediction2 | null): string | undefined {
  if (!p?.optionId) return undefined
  return PREDICTION_2.options.find((o) => o.id === p.optionId)?.label
}

// ---------------------------------------------------------------------------
// Predict panel — full right-pane state with question + options + free-text
// ---------------------------------------------------------------------------

function PredictPanel<K extends string>({
  label,
  framing,
  options,
  onSubmit,
  disabled,
}: {
  label: string
  framing: string
  options: PredictionOption<K>[]
  onSubmit: (input: { optionId?: K; freeText?: string }) => void
  disabled: boolean
}) {
  const [freeText, setFreeText] = useState('')

  const submitFreeText = () => {
    const trimmed = freeText.trim()
    if (trimmed.length === 0) return
    onSubmit({ freeText: trimmed })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-text-tertiary text-[10px] font-medium uppercase tracking-wide">
        {label}
      </div>
      <p className="text-text-primary text-[15px] leading-relaxed">{framing}</p>

      <div className="mt-1 flex flex-col gap-2">
        {options.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit({ optionId: opt.id })}
            className={cn(
              'border-border-subtle hover:bg-state-hover hover:border-accent/40',
              'text-text-primary font-text rounded-md border bg-surface',
              'flex items-start gap-2.5 px-3 py-2.5 text-left text-[13px] leading-snug',
              'cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <span
              className={cn(
                'bg-state-pill text-text-secondary mt-0.5 inline-flex h-5 w-5 shrink-0',
                'items-center justify-center rounded-full text-[10px] font-medium',
              )}
            >
              {idx + 1}
            </span>
            <span className="flex-1">{opt.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <span className="text-text-tertiary text-[10px] uppercase tracking-wide">
          Or in your own words
        </span>
        <textarea
          value={freeText}
          disabled={disabled}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitFreeText()
            }
          }}
          rows={2}
          placeholder="Type a sentence and press Enter…"
          className={cn(
            'font-text text-text-primary placeholder:text-text-tertiary',
            'border-border-subtle focus:border-accent/40 rounded-md border bg-surface',
            'resize-none px-2.5 py-2 text-[12px] leading-snug outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper + gate indicator
// ---------------------------------------------------------------------------

function Stepper({
  canRetreat,
  canAdvance,
  position,
  total,
  onRetreat,
  onAdvance,
}: {
  canRetreat: boolean
  canAdvance: boolean
  position: number
  total: number
  onRetreat: () => void
  onAdvance: (opts?: { force?: boolean }) => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <button
        type="button"
        onClick={onRetreat}
        disabled={!canRetreat}
        className={cn(
          'text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1 text-[12px]',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        )}
      >
        <ChevronLeft className="size-3.5" />
        Back
      </button>
      <span className="text-text-tertiary text-[11px] tabular-nums">
        {position} / {total}
      </span>
      <button
        type="button"
        onClick={() => onAdvance()}
        disabled={!canAdvance}
        className={cn(
          'text-text-secondary hover:text-text-primary inline-flex items-center gap-1 text-[12px]',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        )}
      >
        Next
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  )
}

function GateIndicator({
  label,
  onSkip,
}: {
  label: string
  onSkip?: () => void
}) {
  const [showSkip, setShowSkip] = useState(false)
  // Reset the 10s skip timer whenever the gate label changes. Tracked-prop
  // derived-state pattern keeps the reset in render rather than in an effect.
  const [prevLabel, setPrevLabel] = useState(label)
  if (label !== prevLabel) {
    setPrevLabel(label)
    setShowSkip(false)
  }
  useEffect(() => {
    const id = window.setTimeout(() => setShowSkip(true), 10_000)
    return () => window.clearTimeout(id)
  }, [label])

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-accent-strong/85 inline-flex items-center gap-1.5">
        <span aria-hidden className="bg-accent-strong/70 inline-block size-1.5 rounded-full" />
        {label}
      </span>
      {showSkip && onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-text-tertiary hover:text-text-secondary underline-offset-2 hover:underline"
        >
          Skip this and keep going
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Viewport cue — invites the user to interact with the 3D scene when the
// active bubble's cue is 'viewport'. Disappears as soon as the user starts
// rotating (rotationRad > 0).
// ---------------------------------------------------------------------------

function ViewportCue({ artifact }: { artifact: ArtifactState }) {
  const cue = activeCue(artifact)
  if (cue !== 'viewport') return null
  if (artifact.rotationRad > 0.05) return null
  return (
    <div
      aria-hidden
      className={cn(
        'border-accent/35 bg-accent/8 text-accent-strong',
        'pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2',
        'animate-[artifactStateIn_300ms_ease-out] rounded-full border border-dashed px-3 py-1',
        'text-center text-[11px] backdrop-blur-sm',
      )}
    >
      Drag to rotate
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlays — References and Summary, openable from the header at any time
// ---------------------------------------------------------------------------

function ReferencesOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayShell title="References" onClose={onClose}>
      <p className="text-text-tertiary text-[12px] leading-snug">
        Rotate any molecule yourself, or read the primer.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {RESOURCES.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(
                'border-border-subtle hover:bg-state-hover hover:border-accent/30',
                'group flex items-start justify-between gap-2 rounded-md border bg-surface px-3 py-2.5',
                'transition-colors',
              )}
            >
              <div className="min-w-0">
                <div className="text-text-primary truncate text-[13px] font-medium">
                  {r.title}
                </div>
                <div className="text-text-tertiary text-[11px]">{r.source}</div>
              </div>
              <ExternalLink className="text-text-tertiary group-hover:text-text-secondary mt-0.5 size-3.5 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </OverlayShell>
  )
}

function SummaryOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayShell title="Takeaway" onClose={onClose}>
      <div className="border-accent/30 bg-accent/5 flex flex-col gap-2 rounded-md border p-3.5">
        <div className="text-accent-strong text-[10px] font-medium uppercase tracking-wide">
          {SUMMARY_CARD.title}
        </div>
        <ul className="flex flex-col gap-2">
          {SUMMARY_CARD.lines.map((line, i) => (
            <li
              key={i}
              className="text-text-secondary flex items-start gap-2 text-[13px] leading-snug"
            >
              <span className="bg-accent-strong/70 mt-1.5 inline-block size-1 shrink-0 rounded-full" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </OverlayShell>
  )
}

function OverlayShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center bg-black/30 p-6 backdrop-blur-[2px] animate-[artifactStateIn_220ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        className="bg-surface border-border-subtle relative w-full max-w-md rounded-lg border p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-text-primary font-serif text-sm">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:bg-state-hover hover:text-text-secondary inline-flex size-7 items-center justify-center rounded-md transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsed fallback — artifact tag in a chat where the artifact state is gone
// ---------------------------------------------------------------------------

function ArtifactCollapsed() {
  return (
    <div className="border-border-soft bg-state-pill/40 text-text-tertiary my-3 rounded-md border px-3 py-2 text-xs italic">
      Molecular geometry explainer · closed
    </div>
  )
}
