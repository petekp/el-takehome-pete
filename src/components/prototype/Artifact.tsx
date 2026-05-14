'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  bubblesForStage,
  followUpFor,
  usePrototypeStore,
  type ArtifactPrediction,
  type ArtifactStage,
} from '@/lib/prototype-store'
import {
  PREDICTION_1,
  RESOURCES,
  type Bubble,
  type PredictionOption,
} from '@/lib/artifact-script'
import { MoleculeScene } from './MoleculeScene'
import { ToggleChips } from './ToggleChips'
import { RepresentationPanels } from './RepresentationPanels'

/**
 * The inline artifact — the single core surface the prototype is built
 * around.
 *
 * Triggered by Streamdown when it encounters the `<artifact/>` tag in an
 * assistant message. Reads state from PrototypeStore — the message is just
 * the placeholder; the surface is fully state-driven.
 *
 * Layout (per the chemistry spec):
 *   left 2/3:  ToggleChips → MoleculeScene → RepresentationPanels
 *   right 1/3: bubble track (top/middle) + prediction surface OR resources (bottom)
 *
 * Bubbles live in the right column — no spatial anchoring on the 3D scene
 * (occlusion problems). Past bubbles partially visible above the active one.
 */
export function Artifact() {
  const {
    state,
    advanceArtifact,
    retreatArtifact,
    recordPrediction1,
    recordPrediction2,
    closeArtifact,
  } = usePrototypeStore()
  const arc = state.arc
  const artifact = arc.artifact

  // The tag may render in a chat where the artifact was reset (e.g., user
  // navigated away and back). Show an inert collapsed state.
  if (!artifact || arc.beat === 'idle') {
    return <ArtifactCollapsed />
  }

  // After the user closes the artifact and we've moved to wrapper-followup,
  // freeze the artifact at the closing state — it stays viewable inline as
  // a record of what just happened.
  const interactive = arc.beat === 'artifact-active' || arc.beat === 'artifact-resolved'

  const bubbles = bubblesForStage(artifact.stage, artifact.prediction1, artifact.prediction2)
  const currentBubble = bubbles[artifact.bubbleIndex] ?? null
  const canRetreat = artifact.bubbleIndex > 0
  const gateBlocked = isGateBlocked(currentBubble, artifact.panelsClicked.length)

  // Show predict surface during predict-1 / predict-2 stages.
  const showPredict1 = artifact.stage === 'predict-1' && interactive
  const showPredict2 = artifact.stage === 'predict-2' && interactive
  const showResources = artifact.stage === 'closing'

  // After closing bubble, surface the "close" CTA.
  const showCloseCta = artifact.stage === 'closing' && interactive

  return (
    <section
      className={cn(
        'border-border-subtle bg-surface my-4 overflow-hidden rounded-lg border shadow-sm',
        'relative',
      )}
      aria-label="Molecular geometry explainer"
    >
      <Header
        title="Molecular geometry"
        stage={artifact.stage}
        onClose={interactive ? closeArtifact : undefined}
      />

      <div className="grid grid-cols-[1fr_280px] gap-0">
        {/* Left — 3D viewport on top, representation panels below */}
        <div className="border-border-soft flex flex-col gap-3 border-r p-4">
          <ToggleChips />
          <div className="relative aspect-[4/3] w-full">
            <MoleculeScene
              molecule={artifact.activeMolecule}
              chipState={artifact.chipState}
              activePanel={artifact.activePanel}
              className="absolute inset-0"
            />
          </div>
          <RepresentationPanels />
          {artifact.activePanel && (
            <AnnotationFootnote
              panelId={artifact.activePanel}
            />
          )}
        </div>

        {/* Right — bubble track + prediction / resources */}
        <aside className="bg-page/40 flex h-full flex-col">
          <BubbleTrack
            bubbles={bubbles}
            currentIndex={artifact.bubbleIndex}
            interactive={interactive}
            canRetreat={canRetreat}
            gateBlocked={gateBlocked}
            stage={artifact.stage}
            panelsClicked={artifact.panelsClicked.length}
            onAdvance={advanceArtifact}
            onRetreat={retreatArtifact}
          />
          <div className="border-border-soft border-t px-3.5 py-3.5">
            {showPredict1 && (
              <PredictPanel
                label="Your read"
                framing={PREDICTION_1.framing}
                options={PREDICTION_1.options}
                onSubmit={recordPrediction1}
              />
            )}
            {showPredict2 && (
              <PredictPanel
                label="One more"
                framing={followUpFor(artifact.prediction1).framing}
                options={followUpFor(artifact.prediction1).options}
                onSubmit={recordPrediction2}
              />
            )}
            {showResources && <ResourcesPanel showCloseCta={showCloseCta} onClose={closeArtifact} />}
            {!showPredict1 && !showPredict2 && !showResources && (
              <ContextStrip
                prediction1={artifact.prediction1}
                prediction2={artifact.prediction2}
              />
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

function isGateBlocked(bubble: Bubble | null, panelsClickedCount: number): boolean {
  if (!bubble?.gate) return false
  if (bubble.gate === 'panels-explored') return panelsClickedCount < 2
  return false
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  title,
  stage,
  onClose,
}: {
  title: string
  stage: ArtifactStage
  onClose?: () => void
}) {
  return (
    <header className="border-border-soft flex items-center justify-between gap-3 border-b px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-text-tertiary text-[10px] uppercase tracking-wide">Explainer</span>
        <h3 className="text-text-primary truncate font-serif text-sm">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        <StageDots stage={stage} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close explainer"
            className="text-text-tertiary hover:text-text-secondary inline-flex size-6 items-center justify-center rounded-full transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </header>
  )
}

const STAGE_ORDER: ArtifactStage[] = [
  'opening',
  'predict-1',
  'reveal-1',
  'predict-2',
  'reveal-2',
  'closing',
]

function StageDots({ stage }: { stage: ArtifactStage }) {
  const idx = STAGE_ORDER.indexOf(stage)
  return (
    <div className="flex items-center gap-1">
      {STAGE_ORDER.map((s, i) => (
        <span
          key={s}
          className={cn(
            'size-1.5 rounded-full transition-colors',
            i < idx && 'bg-text-tertiary/40',
            i === idx && 'bg-accent-strong',
            i > idx && 'bg-text-tertiary/15',
          )}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bubble track
// ---------------------------------------------------------------------------

/**
 * The bubble track. Past bubbles are visible above the active one with
 * decreasing opacity. The active bubble is the click target for advance.
 *
 * When the active bubble has an unfulfilled gate (Beat 3: must click ≥2
 * panels first), the advance is blocked and a small hint surfaces.
 */
function BubbleTrack({
  bubbles,
  currentIndex,
  interactive,
  canRetreat,
  gateBlocked,
  stage,
  panelsClicked,
  onAdvance,
  onRetreat,
}: {
  bubbles: Bubble[]
  currentIndex: number
  interactive: boolean
  canRetreat: boolean
  gateBlocked: boolean
  stage: ArtifactStage
  panelsClicked: number
  onAdvance: () => void
  onRetreat: () => void
}) {
  const activeBubble = bubbles[currentIndex] ?? null
  const pastBubbles = bubbles.slice(Math.max(0, currentIndex - 2), currentIndex)
  const isPredict = stage === 'predict-1' || stage === 'predict-2'

  return (
    <div className="flex flex-1 flex-col gap-2 px-3.5 py-3.5">
      {/* Past bubbles, faded by distance from the active one */}
      <div className="flex flex-col gap-1.5">
        {pastBubbles.map((b, i) => {
          const distance = pastBubbles.length - i
          const opacity = distance === 1 ? 0.55 : 0.32
          return (
            <div
              key={`past-${currentIndex}-${i}`}
              className={cn(
                'border-border-subtle bg-page',
                'rounded-md border px-3 py-2 text-[12px] leading-snug',
                'text-text-secondary font-text',
              )}
              style={{ opacity }}
            >
              {b.text}
            </div>
          )
        })}
      </div>

      {/* Active bubble — click target for advance */}
      {activeBubble && !isPredict && (
        <button
          type="button"
          onClick={interactive && !gateBlocked ? onAdvance : undefined}
          disabled={!interactive || gateBlocked}
          className={cn(
            'group text-left w-full',
            'border-border-subtle bg-page',
            'rounded-md border px-3.5 py-2.5 text-[13px] leading-snug',
            'text-text-primary font-text shadow-sm',
            'animate-[bubbleFadeIn_220ms_ease-out]',
            interactive && !gateBlocked && 'cursor-pointer hover:border-accent/30 hover:shadow',
            (!interactive || gateBlocked) && 'cursor-default',
          )}
          aria-label="Advance"
        >
          {activeBubble.text}
        </button>
      )}

      {isPredict && (
        <div className="text-text-tertiary text-[11px] italic leading-snug">
          {stage === 'predict-1' ? 'Pick the closest read →' : 'One more →'}
        </div>
      )}

      {/* Gate hint */}
      {gateBlocked && activeBubble?.gate === 'panels-explored' && (
        <div
          className={cn(
            'border-accent/30 bg-accent/8 text-accent-strong',
            'rounded-md border border-dashed px-3 py-1.5 text-[11px] leading-snug',
          )}
        >
          Click {2 - panelsClicked} more panel{2 - panelsClicked === 1 ? '' : 's'} below
          to continue.
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onRetreat}
          disabled={!canRetreat || !interactive}
          className={cn(
            'text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1 text-[11px]',
            'transition-colors disabled:cursor-not-allowed disabled:opacity-30',
          )}
        >
          <ChevronLeft className="size-3" />
          Back
        </button>
        <span className="text-text-tertiary text-[11px] tabular-nums">
          {isPredict ? '·' : `${currentIndex + 1} / ${Math.max(bubbles.length, 1)}`}
        </span>
        <button
          type="button"
          onClick={onAdvance}
          disabled={!interactive || isPredict || gateBlocked || !activeBubble}
          className={cn(
            'text-text-secondary hover:text-text-primary inline-flex items-center gap-1 text-[11px]',
            'transition-colors disabled:cursor-not-allowed disabled:opacity-30',
          )}
        >
          Next
          <ChevronRight className="size-3" />
        </button>
      </div>
      <style>{`
        @keyframes bubbleFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Annotation footnote — shown beneath the 3D scene when a panel is active
// ---------------------------------------------------------------------------

const PANEL_OMITS_PROSE: Record<string, { tellsYou: string; omits: string }> = {
  lewis: {
    tellsYou: 'Electron bookkeeping — bonded pairs and lone pairs.',
    omits: '3D geometry. Bond angles. Where the lone pair sits in space.',
  },
  wedge: {
    tellsYou: 'Bond directions: in plane (lines), toward you (wedge), behind (dash).',
    omits: 'The shape of lone-pair electron density.',
  },
  geometry: {
    tellsYou: 'Shape name. Bond angle. Electron-domain geometry.',
    omits: 'The molecule itself — only the label.',
  },
}

function AnnotationFootnote({ panelId }: { panelId: string }) {
  const meta = PANEL_OMITS_PROSE[panelId]
  if (!meta) return null
  return (
    <div className="border-border-subtle bg-page/60 grid grid-cols-2 gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug">
      <div>
        <div className="text-text-tertiary text-[9.5px] uppercase tracking-wide">Tells you</div>
        <div className="text-text-secondary mt-0.5">{meta.tellsYou}</div>
      </div>
      <div>
        <div className="text-text-tertiary text-[9.5px] uppercase tracking-wide">Omits</div>
        <div className="text-text-secondary mt-0.5">{meta.omits}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Predict panel — the right-column prediction interface
// ---------------------------------------------------------------------------

function PredictPanel({
  label,
  framing,
  options,
  onSubmit,
}: {
  label: string
  framing: string
  options: PredictionOption[]
  onSubmit: (input: { optionId?: string; freeText?: string }) => void
}) {
  const [freeText, setFreeText] = useState('')

  const submitFreeText = () => {
    const trimmed = freeText.trim()
    if (trimmed.length === 0) return
    onSubmit({ freeText: trimmed })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-text-tertiary text-[10px] uppercase tracking-wide">{label}</div>
      <p className="text-text-secondary text-[13px] leading-snug">{framing}</p>

      <div className="mt-1 flex flex-col gap-1.5">
        {options.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSubmit({ optionId: opt.id })}
            className={cn(
              'border-border-subtle hover:bg-state-hover hover:border-accent/40',
              'text-text-primary font-text rounded-md border bg-transparent',
              'flex items-start gap-2 px-2.5 py-2 text-left text-[12px] leading-snug',
              'cursor-pointer transition-colors',
            )}
          >
            <span
              className={cn(
                'bg-state-pill text-text-secondary inline-flex h-5 w-5 shrink-0',
                'items-center justify-center rounded-full text-[10px] font-medium',
              )}
            >
              {idx + 1}
            </span>
            <span className="flex-1">{opt.label}</span>
          </button>
        ))}
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitFreeText()
            }
          }}
          rows={1}
          placeholder="or in your own words…"
          className={cn(
            'font-text text-text-primary placeholder:text-text-tertiary',
            'border-border-subtle focus:border-accent/40 rounded-md border bg-transparent',
            'resize-none px-2.5 py-2 text-[12px] leading-snug outline-none',
          )}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resources panel — closing surface
// ---------------------------------------------------------------------------

function ResourcesPanel({
  showCloseCta,
  onClose,
}: {
  showCloseCta: boolean
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-text-tertiary text-[10px] uppercase tracking-wide">Go deeper</div>
        <p className="text-text-tertiary mt-1 text-[11px] leading-snug">
          A 3D viewer to play with, and the canonical primer.
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {RESOURCES.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(
                'border-border-subtle hover:bg-state-hover hover:border-accent/30',
                'group flex items-start justify-between gap-2 rounded-md border bg-transparent px-2.5 py-2',
                'transition-colors',
              )}
            >
              <div className="min-w-0">
                <div className="text-text-primary truncate text-[12px] font-medium">
                  {r.title}
                </div>
                <div className="text-text-tertiary text-[10px]">{r.source}</div>
              </div>
              <ExternalLink className="text-text-tertiary group-hover:text-text-secondary mt-0.5 size-3 shrink-0" />
            </a>
          </li>
        ))}
      </ul>

      {showCloseCta && (
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

// ---------------------------------------------------------------------------
// Context strip — what user picked, shown while in reveal-1 / reveal-2
// ---------------------------------------------------------------------------

function ContextStrip({
  prediction1,
  prediction2,
}: {
  prediction1: ArtifactPrediction | null
  prediction2: ArtifactPrediction | null
}) {
  return (
    <div className="flex flex-col gap-3">
      {prediction1 && (
        <PredictionEcho label="You said" prediction={prediction1} optionsHint={PREDICTION_1.options} />
      )}
      {prediction2 && (
        <PredictionEcho
          label="And"
          prediction={prediction2}
          optionsHint={followUpFor(prediction1).options}
        />
      )}
      {!prediction1 && (
        <p className="text-text-tertiary text-[11px] italic leading-snug">
          Click the bubble to follow along.
        </p>
      )}
    </div>
  )
}

function PredictionEcho({
  label,
  prediction,
  optionsHint,
}: {
  label: string
  prediction: ArtifactPrediction
  optionsHint: PredictionOption[]
}) {
  const text = prediction.optionId
    ? (optionsHint.find((o) => o.id === prediction.optionId)?.label ?? '')
    : (prediction.freeText ?? '')
  return (
    <div className="flex flex-col gap-1">
      <span className="text-text-tertiary text-[10px] uppercase tracking-wide">{label}</span>
      <span className="border-border-subtle bg-page/60 text-text-secondary rounded-md border px-2.5 py-1.5 text-[11px] leading-snug">
        “{text}”
      </span>
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
