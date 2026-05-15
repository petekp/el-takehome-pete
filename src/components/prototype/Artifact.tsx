'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Expand,
  Maximize2,
  Minimize2,
  RotateCcw,
  Share2,
  X,
} from 'lucide-react'
import type { RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  activeCue,
  bubblesForStage,
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
  stepPosition,
  TOTAL_STEPS,
  type Bubble,
  type PredictionOption,
  type Prediction1Key,
  type Prediction2Key,
} from '@/lib/artifact-script'
import { ControlChip, ControlPane } from './ControlPane'
import {
  LonePairSelect,
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
 * The right pane is a state machine. At any moment it shows exactly one of:
 *   - Bubble state  (an active bubble, centered with breathing room)
 *   - Predict state (the prediction question + options + free-text)
 *   - Reveal state  (the first bubble of the reveal sequence, plus a
 *                    "You said" attribution chip)
 *   - Closing state (the closing bubble + resources + Done)
 *
 * Below it sits a persistent stepper: Back / position / Next. Next disables
 * on the final beat — Done is the exit action there.
 *
 * The header carries only the title and a small button cluster (Attachments,
 * Resources, Share, Fullscreen).
 */

// Stepper math (TOTAL_STEPS, stepPosition) lives in artifact-script so the
// summary Claude sees and the UI stepper stay in lockstep.

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


type LiteracyPanel = 'lewis' | 'geometry'
type ShareStatus = 'idle' | 'copied' | 'failed' | 'unavailable'
type FullscreenStatus = 'idle' | 'failed' | 'unavailable'

function panelDisplayLabel(panel: ArtifactState['activePanel']): string {
  if (panel === 'lewis') return 'Lewis'
  if (panel === 'geometry') return 'Molecular geometry'
  if (panel === 'materials') return 'Materials'
  return 'Default'
}

function isLiteracyPanel(panel: ArtifactState['activePanel']): panel is LiteracyPanel {
  return panel === 'lewis' || panel === 'geometry'
}

function defaultRowLpCountForStage(stage: ArtifactStage): number | null {
  return stage === 'reveal-2' ? 2 : null
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (window.navigator.clipboard) {
    await window.navigator.clipboard.writeText(text)
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export function Artifact() {
  const {
    state,
    advanceArtifact,
    retreatArtifact,
    resetArtifact,
    recordPrediction1,
    recordPrediction2,
    closeArtifact,
    addRotation,
    clickPanel,
  } = usePrototypeStore()
  const arc = state.arc
  const artifact = arc.artifact

  const [referencesOpen, setReferencesOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<{
    panel: LiteracyPanel
    ownerKey: string
  } | null>(null)
  const [introStatementReady, setIntroStatementReady] = useState(false)
  const [introStatementStreamed, setIntroStatementStreamed] = useState(false)
  const [stepDirection, setStepDirection] = useState<StepDirection>('forward')
  const artifactRef = useRef<HTMLElement | null>(null)

  const handleMoleculeEntranceStart = useCallback(() => {
    setIntroStatementReady(true)
  }, [])

  const handleIntroStatementDone = useCallback(() => {
    setIntroStatementStreamed(true)
  }, [])

  // Row-example mode (5-domain row chip). null = inactive: scene renders the
  // scripted molecule at its natural LP count. Integer 0..3 = active: scene
  // renders the matching real example (0→PF5, 1→SF4, 2→ClF3, 3→XeF2).
  // The chip itself is hidden outside reveal-2 / closing.
  const [rowSelection, setRowSelection] = useState<{
    stage: ArtifactStage
    value: number | null
  } | null>(null)
  const rowLpCount =
    artifact && rowSelection?.stage === artifact.stage
      ? rowSelection.value
      : artifact
        ? defaultRowLpCountForStage(artifact.stage)
        : null

  // Reset expansion whenever the active panel changes underneath (panel
  // deactivated, switched to another literacy panel, etc.) so we never end
  // up with an expanded overlay for a panel that isn't even active.
  const rawActivePanel = artifact?.activePanel ?? null
  const activeLiteracyPanel: LiteracyPanel | null = isLiteracyPanel(rawActivePanel)
    ? rawActivePanel
    : null
  const expandedOwnerKey = artifact
    ? `${artifact.stage}:${artifact.bubbleIndex}:${activeLiteracyPanel ?? 'none'}`
    : 'none'
  const visibleExpandedPanel =
    expandedPanel &&
    expandedPanel.ownerKey === expandedOwnerKey &&
    expandedPanel.panel === activeLiteracyPanel
      ? expandedPanel.panel
      : null

  useEffect(() => {
    if (!referencesOpen && !materialsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReferencesOpen(false)
        setMaterialsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [referencesOpen, materialsOpen])

  const handleOpenMaterials = useCallback(() => {
    clickPanel('materials')
    setMaterialsOpen(true)
  }, [clickPanel])

  const handleAdvance = useCallback(() => {
    setStepDirection('forward')
    advanceArtifact()
  }, [advanceArtifact])

  const handleRetreat = useCallback(() => {
    setStepDirection('back')
    retreatArtifact()
  }, [retreatArtifact])

  const handleReset = useCallback(() => {
    setStepDirection('back')
    setReferencesOpen(false)
    setMaterialsOpen(false)
    setExpandedPanel(null)
    setRowSelection(null)
    setIntroStatementReady(true)
    setIntroStatementStreamed(false)
    resetArtifact()
  }, [resetArtifact])

  const handleSubmitPrediction1 = useCallback(
    (input: { optionId?: Prediction1Key; freeText?: string }) => {
      setStepDirection('forward')
      recordPrediction1(input)
    },
    [recordPrediction1],
  )

  const handleSubmitPrediction2 = useCallback(
    (input: { optionId?: Prediction2Key; freeText?: string }) => {
      setStepDirection('forward')
      recordPrediction2(input)
    },
    [recordPrediction2],
  )

  const handleExpandPanel = useCallback(
    (panel: LiteracyPanel | null) => {
      setExpandedPanel(panel ? { panel, ownerKey: expandedOwnerKey } : null)
    },
    [expandedOwnerKey],
  )

  if (!artifact || arc.beat === 'idle') {
    return <ArtifactCollapsed />
  }

  // After the user closes the artifact and we've moved to wrapper-followup,
  // freeze the artifact at the closing state — it stays viewable as a
  // record of what just happened.
  const interactive = arc.beat === 'artifact-active' || arc.beat === 'artifact-resolved'

  return (
    <section
      ref={artifactRef}
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
          lpCount={rowLpCount ?? moleculeNaturalLpCount(artifact.activeMolecule)}
          rowExampleActive={rowLpCount !== null}
          onRotationDelta={addRotation}
          onExitTreatment={
            artifact.activePanel ? () => clickPanel(artifact.activePanel!) : undefined
          }
          onEntranceStart={handleMoleculeEntranceStart}
          topOverlayInsetPx={64}
          rightOverlayInsetPx={376}
          bottomOverlayInsetPx={64}
          className="absolute inset-0"
        />

        <Header
          title="Why XeF₂ is linear"
          attachments={artifact.userAttachments}
          materialsCued={
            activeCue(artifact) === 'panel-materials' &&
            !artifact.panelsExplored.includes('materials')
          }
          fullscreenTargetRef={artifactRef}
          onOpenMaterials={handleOpenMaterials}
          onReferences={() => setReferencesOpen(true)}
        />

        <ViewportCue artifact={artifact} />

        {/* Bottom-of-viewport control pane. Each chip surfaces a label +
            current value; click opens the actual control above. Positioned
            to stop short of the floating right pane so popovers don't slip
            behind it. The 5-domain row chip appears only after the ClF3
            reveal — opening, predict-1, reveal-1, and predict-2 hide it so
            the learner isn't offered the answer before the prediction. */}
        <ControlPane className="absolute bottom-3 left-3 z-10">
          <ControlChip
            label="View"
            value={panelDisplayLabel(artifact.activePanel)}
            popoverClassName="rounded-lg p-1"
          >
            <RepresentationPanels />
          </ControlChip>
          {(artifact.stage === 'reveal-2' || artifact.stage === 'closing') && (
            <ControlChip
              label="5-domain row"
              value={rowLpCount === null ? 'Try one' : lpShapeLabel(rowLpCount)}
              popoverClassName="rounded-lg p-1"
            >
              <LonePairSelect
                value={rowLpCount ?? 3}
                onChange={(value) =>
                  setRowSelection({ stage: artifact.stage, value })
                }
              />
            </ControlChip>
          )}
        </ControlPane>

        {/* Right pane as a translucent panel on top of the visualization. */}
        <aside
          className={cn(
            'absolute bottom-3 right-3 top-[60px] z-10 flex w-[356px] flex-col',
            'bg-surface-dim/97 border-border-subtle overflow-hidden rounded-md border',
            'backdrop-blur-md',
          )}
        >
          <RightPane
            artifact={artifact}
            interactive={interactive}
            introStatementReady={introStatementReady}
            introStatementStreamed={introStatementStreamed}
            direction={stepDirection}
            expandedPanel={visibleExpandedPanel}
            onExpandPanel={handleExpandPanel}
            onAdvance={handleAdvance}
            onRetreat={handleRetreat}
            onReset={handleReset}
            onSubmitPrediction1={handleSubmitPrediction1}
            onSubmitPrediction2={handleSubmitPrediction2}
            onClose={closeArtifact}
            onOpenReferences={() => setReferencesOpen(true)}
            onIntroStatementDone={handleIntroStatementDone}
          />
          {/* Expanded-diagram clone overlays the entire right-pane card —
              including the stepper footer — via motion's layoutId animation.
              The thumbnail inside the bubble stays in flow with opacity 0 so
              content position never shifts. */}
          <AnimatePresence>
            {visibleExpandedPanel && (
              <motion.div
                key={`expanded-${visibleExpandedPanel}`}
                layoutId={`panel-diagram-${visibleExpandedPanel}`}
                transition={{ type: 'spring', stiffness: 280, damping: 32, mass: 0.7 }}
                className={cn(
                  'bg-surface/95 absolute inset-0 z-30 flex flex-col items-center',
                  'justify-center gap-3 p-6 backdrop-blur-sm',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleExpandPanel(null)}
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
                  panel={visibleExpandedPanel}
                  molecule={artifact.activeMolecule}
                  expanded
                />
                <figcaption className="text-text-tertiary font-serif text-[14px] italic">
                  {visibleExpandedPanel === 'lewis' ? 'Lewis structure' : 'Molecular geometry'}
                </figcaption>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      {referencesOpen && <ReferencesOverlay onClose={() => setReferencesOpen(false)} />}
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
  materialsCued,
  fullscreenTargetRef,
  onOpenMaterials,
  onReferences,
}: {
  title: string
  attachments: ImageAttachment[]
  materialsCued: boolean
  fullscreenTargetRef: RefObject<HTMLElement | null>
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
          cued={materialsCued}
          onClick={onOpenMaterials}
        />
        <div className="flex items-center gap-1">
          <HeaderLabeledButton label="Resources" onClick={onReferences}>
            <BookOpen className="size-3.5" />
          </HeaderLabeledButton>
          <ShareButton />
          <FullscreenButton targetRef={fullscreenTargetRef} />
        </div>
      </div>
    </header>
  )
}

function ShareButton() {
  const [status, setStatus] = useState<ShareStatus>('idle')
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    }
  }, [])

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      setStatus('idle')
      resetTimerRef.current = null
    }, 1600)
  }, [])

  const handleShare = useCallback(async () => {
    if (status === 'unavailable') return
    try {
      const url = window.location.href
      if (await copyTextToClipboard(url)) {
        setStatus('copied')
        scheduleReset()
        return
      }
      if (window.navigator.share) {
        await window.navigator.share({ title: 'Why XeF2 is linear', url })
        setStatus('idle')
        return
      }
      setStatus('unavailable')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setStatus('failed')
      scheduleReset()
    }
  }, [scheduleReset, status])

  const label =
    status === 'unavailable'
      ? 'Share unavailable'
      : status === 'copied'
        ? 'Link copied'
        : status === 'failed'
          ? 'Share failed'
          : 'Share'

  return (
    <HeaderIconButton
      label={label}
      onClick={handleShare}
      disabled={status === 'unavailable'}
      tooltip={
        status === 'unavailable'
          ? 'Sharing is unavailable in this browser'
          : status === 'failed'
            ? 'Could not copy the link'
            : status === 'copied'
              ? 'Link copied'
              : 'Copy link'
      }
    >
      {status === 'copied' ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
    </HeaderIconButton>
  )
}

function FullscreenButton({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [status, setStatus] = useState<FullscreenStatus>('idle')

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === targetRef.current)
      setStatus('idle')
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [targetRef])

  const handleFullscreen = useCallback(() => {
    const el = targetRef.current
    if (status === 'unavailable') return
    if (!el || !document.fullscreenEnabled || !el.requestFullscreen) {
      setStatus('unavailable')
      return
    }
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => setStatus('failed'))
      return
    }
    void el.requestFullscreen().catch(() => setStatus('failed'))
  }, [status, targetRef])

  const label =
    status === 'unavailable'
      ? 'Fullscreen unavailable'
      : status === 'failed'
        ? 'Fullscreen failed'
        : isFullscreen
          ? 'Exit fullscreen'
          : 'Fullscreen'

  return (
    <HeaderIconButton
      label={label}
      onClick={handleFullscreen}
      disabled={status === 'unavailable'}
      tooltip={
        status === 'unavailable'
          ? 'Fullscreen is unavailable in this browser'
          : status === 'failed'
            ? 'Could not enter fullscreen'
            : label
      }
    >
      {isFullscreen ? <Minimize2 className="size-3.5" /> : <Expand className="size-3.5" />}
    </HeaderIconButton>
  )
}

/**
 * Stacked-paper thumbnail control in the artifact header. Three thumbnails
 * max, fanned out with small rotations so the stack reads as "papers". The
 * whole control opens the materials lightbox.
 */
function MaterialsHeaderStack({
  attachments,
  cued,
  onClick,
}: {
  attachments: ImageAttachment[]
  cued: boolean
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
        cued && 'z-10 shadow-[0_0_0_2px_rgba(0,139,255,0.2)]',
      )}
    >
      {cued && (
        <span
          aria-hidden
          className="border-accent/40 bg-accent/8 pointer-events-none absolute -inset-0.5 -z-10 animate-[cuePulse_1600ms_ease-in-out_infinite] rounded-md border"
        />
      )}
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
  introStatementReady: boolean
  introStatementStreamed: boolean
  direction: StepDirection
  expandedPanel: LiteracyPanel | null
  onExpandPanel: (panel: LiteracyPanel | null) => void
  onAdvance: () => void
  onRetreat: () => void
  onReset: () => void
  onSubmitPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  onSubmitPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  onClose: () => void
  onOpenReferences: () => void
  onIntroStatementDone: () => void
}

function RightPane({
  artifact,
  interactive,
  introStatementReady,
  introStatementStreamed,
  direction,
  expandedPanel,
  onExpandPanel,
  onAdvance,
  onRetreat,
  onReset,
  onSubmitPrediction1,
  onSubmitPrediction2,
  onClose,
  onOpenReferences,
  onIntroStatementDone,
}: RightPaneProps) {
  const bubbles = bubblesForStage(artifact.stage, artifact.prediction1, artifact.prediction2)
  const currentBubble = bubbles[artifact.bubbleIndex] ?? null
  const isPredict = artifact.stage === 'predict-1' || artifact.stage === 'predict-2'
  const isReveal = artifact.stage === 'reveal-1' || artifact.stage === 'reveal-2'
  const isClosing = artifact.stage === 'closing'
  const isRevealHead = isReveal && artifact.bubbleIndex === 0

  // State key drives the in-pane fade transition.
  const stateKey = `${artifact.stage}:${artifact.bubbleIndex}`

  const position = stepPosition(artifact.stage, artifact.bubbleIndex)

  const canRetreat = !(artifact.stage === 'opening' && artifact.bubbleIndex === 0)

  const isFinalBeat = isClosing
  const canAdvance = interactive && !isPredict && !!currentBubble && !isFinalBeat

  return (
    // Stacked flex: content area is min-h-0 flex-1 overflow-y-auto, footer
    // is shrink-0. The previous absolute gradient overlay covered the
    // closing CTAs and forced users to scroll to reach Done.
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
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
            <div
              className={cn(
                'flex min-h-full flex-col gap-3 px-4 pb-4 pt-5',
                // Tall content (closing) anchors to the top so its CTAs sit
                // just above the stepper; short single-bubble states center
                // so the prose has breathing room.
                isClosing || isPredict ? 'justify-start' : 'justify-center',
              )}
            >
              <StateContent
                artifact={artifact}
                currentBubble={currentBubble}
                isPredict={isPredict}
                isRevealHead={isRevealHead}
                isClosing={isClosing}
                introStatementReady={introStatementReady}
                introStatementStreamed={introStatementStreamed}
                interactive={interactive}
                expandedPanel={expandedPanel}
                onExpandPanel={onExpandPanel}
                onSubmitPrediction1={onSubmitPrediction1}
                onSubmitPrediction2={onSubmitPrediction2}
                onClose={onClose}
                onOpenReferences={onOpenReferences}
                onIntroStatementDone={onIntroStatementDone}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="border-border-subtle shrink-0 border-t">
        <Stepper
          canRetreat={canRetreat && interactive}
          canAdvance={canAdvance}
          resetMode={isFinalBeat}
          position={position}
          total={TOTAL_STEPS}
          onRetreat={onRetreat}
          onReset={onReset}
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
  introStatementReady,
  introStatementStreamed,
  interactive,
  expandedPanel,
  onExpandPanel,
  onSubmitPrediction1,
  onSubmitPrediction2,
  onClose,
  onOpenReferences,
  onIntroStatementDone,
}: {
  artifact: ArtifactState
  currentBubble: Bubble | null
  isPredict: boolean
  isRevealHead: boolean
  isClosing: boolean
  introStatementReady: boolean
  introStatementStreamed: boolean
  interactive: boolean
  expandedPanel: LiteracyPanel | null
  onExpandPanel: (panel: LiteracyPanel | null) => void
  onSubmitPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  onSubmitPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  onClose: () => void
  onOpenReferences: () => void
  onIntroStatementDone: () => void
}) {
  if (isPredict) {
    return (
      <div className="flex h-full flex-col gap-4">
        {artifact.stage === 'predict-1' && (
          <PredictPanel<Prediction1Key>
            framing={PREDICTION_1.framing}
            options={PREDICTION_1.options}
            onSubmit={interactive ? onSubmitPrediction1 : () => {}}
            disabled={!interactive}
          />
        )}
        {artifact.stage === 'predict-2' && (
          <PredictPanel<Prediction2Key>
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
      // Bubble scrolls under the sticky CTA stack — Resources and Done stay
      // anchored at the bottom of the visible pane regardless of bubble
      // height. Without this, long closing copy at constrained viewports
      // (e.g. /artifact-debug) pushed Done out of view.
      <div className="flex flex-1 flex-col gap-4">
        {currentBubble && <BubbleCard text={currentBubble.text} />}
        <div className="bg-page sticky bottom-0 -mx-1 mt-auto flex flex-col gap-1 px-1 pb-1 pt-2">
          <button
            type="button"
            onClick={onOpenReferences}
            className={cn(
              'border-border-subtle bg-page hover:bg-state-hover',
              'text-text-secondary rounded-md border px-3 py-2 text-left text-[12px]',
              'inline-flex items-center gap-2 transition-colors',
            )}
          >
            <BookOpen className="size-3.5 shrink-0" />
            Some more resources to check out
          </button>
          {interactive && (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'bg-[#cc785c] hover:bg-[#b86749]',
                'rounded-md px-3 py-2 text-[12px] font-medium text-white',
                'transition-colors',
              )}
            >
              Done — back to the conversation
            </button>
          )}
        </div>
      </div>
    )
  }

  // Bubble state (opening / mid-reveal) — render the bubble, with a
  // "You said" attribution chip when we're entering a reveal sequence. If a
  // literacy panel (Lewis / Wedge / Geometry) is active, surface its 2D
  // diagram inline above the bubble: the 3D viewport shows the matching
  // treatment, and the right pane shows the literal 2D representation.
  //
  // Reveal-head suppresses the inline diagram because the attribution chip
  // already sits above the bubble there; squeezing a thumbnail between the
  // user's prediction and the model's response breaks the conversational
  // back-and-forth read.
  const literacyPanel =
    !isRevealHead &&
    (artifact.activePanel === 'lewis' || artifact.activePanel === 'geometry')
      ? artifact.activePanel
      : null
  const shouldStreamIntro =
    artifact.stage === 'opening' && artifact.bubbleIndex === 0 && !introStatementStreamed

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
      {currentBubble && (
        <BubbleCard
          text={currentBubble.text}
          stream={shouldStreamIntro}
          streamReady={introStatementReady}
          onStreamComplete={onIntroStatementDone}
        />
      )}
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
  const label = panel === 'lewis' ? 'Lewis structure' : 'Molecular geometry'
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

function BubbleCard({
  text,
  stream = false,
  streamReady = true,
  onStreamComplete,
}: {
  text: string
  stream?: boolean
  streamReady?: boolean
  onStreamComplete?: () => void
}) {
  if (stream && !streamReady) return <BubbleText text="" />
  if (stream) return <StreamingBubbleText text={text} onComplete={onStreamComplete} />
  return <BubbleText text={text} />
}

function BubbleText({ text }: { text: string }) {
  return (
    <p className="text-text-primary font-serif text-[17px] leading-relaxed">
      {highlightKeywords(text)}
    </p>
  )
}

function StreamingBubbleText({
  text,
  onComplete,
}: {
  text: string
  onComplete?: () => void
}) {
  const [visibleText, setVisibleText] = useState('')

  useEffect(() => {
    let cancelled = false
    let timeoutId: number | null = null
    let index = 0

    const tick = () => {
      if (cancelled) return
      index += 1
      setVisibleText(text.slice(0, index))
      if (index >= text.length) {
        onComplete?.()
        return
      }
      timeoutId = window.setTimeout(tick, 8)
    }

    timeoutId = window.setTimeout(tick, 60)

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [text, onComplete])

  return <BubbleText text={visibleText} />
}

// Keyword classes use a light bg tint of the matching legend color so the
// element reference reads the same in the prose as it does in the 3D scene.
// Text color stays primary for accessibility — only the background is tinted.
const KEYWORD_REGEX = /\b(Xenon|Xe|Fluorine|F|lone pairs?)\b/g

function keywordClass(token: string): string {
  const t = token.toLowerCase()
  if (t === 'xe' || t === 'xenon') return 'bg-[#8b6dd5]/20'
  if (t === 'f' || t === 'fluorine') return 'bg-[#b8c75c]/35'
  return 'bg-[#14b8a6]/20'
}

function highlightKeywords(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  KEYWORD_REGEX.lastIndex = 0
  while ((match = KEYWORD_REGEX.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    nodes.push(
      <span
        key={`${match.index}-${match[0]}`}
        className={cn('-mx-1 rounded-sm px-1', keywordClass(match[0]))}
      >
        {match[0]}
      </span>,
    )
    last = KEYWORD_REGEX.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
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
  framing,
  options,
  onSubmit,
  disabled,
}: {
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
      <p className="text-text-primary font-serif text-[17px] leading-relaxed">{framing}</p>

      <div className="mt-1 flex flex-col gap-1">
        <div className="border-border-subtle bg-surface flex flex-col overflow-hidden rounded-md border">
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onSubmit({ optionId: opt.id })}
              className={cn(
                'group text-text-primary font-text relative',
                idx > 0 && 'border-border-subtle border-t',
                'first:rounded-t-md last:rounded-b-md',
                'flex items-start gap-2.5 px-3 py-2.5 text-left text-[13px] leading-snug',
                'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                'hover:bg-accent/8 hover:text-accent-strong hover:ring-1 hover:ring-inset hover:ring-accent/25',
              )}
            >
              <span
                className={cn(
                  'bg-state-pill text-text-secondary mt-0.5 inline-flex h-5 w-5 shrink-0',
                  'items-center justify-center rounded-full text-[10px] font-medium',
                  'group-hover:bg-accent/15 group-hover:text-accent-strong',
                )}
              >
                {idx + 1}
              </span>
              <span className="flex-1">{opt.label}</span>
            </button>
          ))}
        </div>
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
          placeholder="Or in your own words…"
          className={cn(
            'font-text text-text-primary placeholder:text-text-tertiary',
            'border-border-subtle bg-surface rounded-md border',
            'resize-none px-3 py-2.5 text-[13px] leading-snug outline-none',
            'focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({
  canRetreat,
  canAdvance,
  resetMode,
  position,
  total,
  onRetreat,
  onReset,
  onAdvance,
}: {
  canRetreat: boolean
  canAdvance: boolean
  resetMode: boolean
  position: number
  total: number
  onRetreat: () => void
  onReset: () => void
  onAdvance: () => void
}) {
  const retreatLabel = resetMode ? 'Reset' : 'Back'
  const retreatIcon = resetMode ? (
    <RotateCcw className="size-3.5" />
  ) : (
    <ChevronLeft className="size-3.5" />
  )
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <button
        type="button"
        onClick={resetMode ? onReset : onRetreat}
        disabled={!canRetreat}
        className={cn(
          'text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1 text-[12px]',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        )}
      >
        {retreatIcon}
        {retreatLabel}
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
