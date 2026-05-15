'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { activeCue, usePrototypeStore, type RepresentationPanelId } from '@/lib/prototype-store'
import type { ElementCue, Molecule } from '@/lib/artifact-script'
import type { ImageAttachment } from '@/lib/types'

/**
 * The row of compact representation cards above the 3D viewport edge.
 *
 * Three cards:
 *   - Lewis structure (3D viewport flattens to a desaturated 2D-style view)
 *   - Wedge-and-dash (3D viewport re-renders bonds as wedges/dashes)
 *   - Geometry chart (3D viewport foregrounds shape name, angles)
 *
 * The card is the affordance, the 3D treatment is the lesson. Cards keep the
 * same shape between inactive and active states — only colour and the
 * accent border distinguish them. If the row overflows horizontally the
 * container scrolls and the cropped side fades out with a linear-gradient
 * mask, hinting that more content is in that direction.
 *
 * A bubble can broadcast a cue ('panel-lewis', 'panels-row', …) which pulses
 * the matching card(s) softly until the user clicks them.
 */

type LiteracyPanelId = Exclude<RepresentationPanelId, 'materials'>

type PanelMeta = {
  id: LiteracyPanelId
  label: string
}

const PANELS: PanelMeta[] = [
  { id: 'lewis', label: 'Lewis' },
  { id: 'wedge', label: 'Wedge-and-dash' },
  { id: 'geometry', label: 'Geometry chart' },
]

/**
 * The 2D diagrams that used to live inside each card. They now render in the
 * right pane next to the bubble so the user sees the literal 2D structure
 * alongside the explanation, while the 3D viewport carries the corresponding
 * treatment. Exported so Artifact can pick the right one based on the active
 * panel. `expanded` swaps to a larger render so the diagram fills the whole
 * right-pane content area.
 */
export function PanelDiagram({
  panel,
  molecule,
  expanded = false,
}: {
  panel: LiteracyPanelId
  molecule: Molecule
  expanded?: boolean
}) {
  if (panel === 'lewis') return <LewisDiagram molecule={molecule} expanded={expanded} />
  if (panel === 'wedge') return <WedgeDashDiagram molecule={molecule} expanded={expanded} />
  return <GeometryCard molecule={molecule} expanded={expanded} />
}

function cueMatchesPanel(cue: ElementCue | null, panel: LiteracyPanelId): boolean {
  if (!cue) return false
  if (cue === 'panels-row') return true
  if (cue === 'panel-lewis') return panel === 'lewis'
  if (cue === 'panel-wedge') return panel === 'wedge'
  if (cue === 'panel-geometry') return panel === 'geometry'
  return false
}

export function RepresentationPanels() {
  const { state, clickPanel } = usePrototypeStore()
  const artifact = state.arc.artifact

  if (!artifact) return null
  const cue = activeCue(artifact)

  return (
    <div role="menu" className="flex w-44 flex-col">
      {PANELS.map((p) => {
        const active = artifact.activePanel === p.id
        const cued = cueMatchesPanel(cue, p.id)
        // Once the user has clicked a cued item, suppress its pulse even if
        // the cue is still broadcasting (e.g. panels-row still wants to
        // highlight the others).
        const explored = artifact.panelsExplored.includes(p.id)
        const showCue = cued && !explored && !active
        return (
          <button
            key={p.id}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => clickPanel(p.id)}
            aria-label={p.label}
            className={cn(
              'relative flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5',
              'text-left text-[12px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'text-accent-strong bg-accent/10'
                : 'text-text-secondary hover:bg-state-hover',
              showCue && 'z-10 shadow-[0_0_0_2px_rgba(0,139,255,0.2)]',
            )}
          >
            <span>{p.label}</span>
            {active && <Check aria-hidden className="text-accent-strong size-3.5" />}
            {showCue && (
              <span
                aria-hidden
                className="border-accent/40 bg-accent/8 pointer-events-none absolute -inset-0.5 -z-10 animate-[cuePulse_1600ms_ease-in-out_infinite] rounded-md border"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Materials lightbox — full-screen view of Naomi's attached photos. Triggered
// from the stacked-thumbnail control in the artifact header.
// ---------------------------------------------------------------------------

export function MaterialsLightbox({
  attachments,
  onClose,
}: {
  attachments: ImageAttachment[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
      onClick={onClose}
      role="dialog"
      aria-label="Your materials"
    >
      <div
        className="bg-page relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-text-primary font-serif text-base">Your materials</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:bg-state-hover hover:text-text-secondary inline-flex size-7 items-center justify-center rounded-full transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {attachments.map((a) => (
            <figure key={a.id} className="flex flex-col gap-2">
              <img
                src={`data:${a.mediaType};base64,${a.data}`}
                alt={a.name}
                className="border-border-subtle max-h-[70vh] w-full rounded-md border object-contain"
              />
              <figcaption className="text-text-tertiary text-xs">{a.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lewis dot structures (schematic SVGs) — XeF2 and ClF3.
// ---------------------------------------------------------------------------

const LEWIS_DOT_R = 1.6
const LEWIS_STROKE = '#3a3833'
const LEWIS_DIM = '#6b665e'

function LewisDiagram({ molecule, expanded = false }: { molecule: Molecule; expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 80"
      preserveAspectRatio="xMidYMid meet"
      className={cn('text-text-primary', expanded ? 'h-auto w-full max-w-[300px]' : 'h-[88px] w-[110px]')}
    >
      {(molecule === 'xef2' || molecule === 'xef2-axial-strain') && <LewisXef2 />}
      {molecule === 'clf3' && <LewisClf3 />}
    </svg>
  )
}

function AtomLabel({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="11"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fontWeight={600}
      fill={LEWIS_STROKE}
    >
      {label}
    </text>
  )
}

function Bond({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const inset = 7
  const ux = dx / len
  const uy = dy / len
  return (
    <line
      x1={x1 + ux * inset}
      y1={y1 + uy * inset}
      x2={x2 - ux * inset}
      y2={y2 - uy * inset}
      stroke={LEWIS_DIM}
      strokeWidth={1.1}
      strokeLinecap="round"
    />
  )
}

/** F atom with three lone pairs (top, sides — schematic). */
function FluorineWithLonePairs({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <AtomLabel x={cx} y={cy} label="F" />
      {/* three small lone-pair dots clusters around the F */}
      <circle cx={cx - 5} cy={cy} r={LEWIS_DOT_R / 1.4} fill={LEWIS_STROKE} />
      <circle cx={cx - 5} cy={cy + 3} r={LEWIS_DOT_R / 1.4} fill={LEWIS_STROKE} />
      <circle cx={cx + 5} cy={cy} r={LEWIS_DOT_R / 1.4} fill={LEWIS_STROKE} />
      <circle cx={cx + 5} cy={cy + 3} r={LEWIS_DOT_R / 1.4} fill={LEWIS_STROKE} />
    </g>
  )
}

function LewisXef2() {
  return (
    <g>
      {/* Lone pairs on Xe (left, right, top) */}
      <circle cx={32} cy={37} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={43} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={68} cy={37} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={68} cy={43} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={47} cy={28} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={28} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* Bonds */}
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      <AtomLabel x={50} y={40} label="Xe" />
      <FluorineWithLonePairs cx={50} cy={10} />
      <FluorineWithLonePairs cx={50} cy={70} />
    </g>
  )
}

function LewisClf3() {
  return (
    <g>
      {/* Two lone pairs on Cl — left and right */}
      <circle cx={32} cy={37} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={43} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={68} cy={37} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={68} cy={43} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* Bonds */}
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      <Bond x1={50} y1={40} x2={84} y2={40} />
      <AtomLabel x={50} y={40} label="Cl" />
      <FluorineWithLonePairs cx={50} cy={10} />
      <FluorineWithLonePairs cx={50} cy={70} />
      <FluorineWithLonePairs cx={88} cy={40} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Wedge-and-dash diagrams — schematic for trigonal bipyramidal.
// ---------------------------------------------------------------------------

function WedgeDashDiagram({
  molecule,
  expanded = false,
}: {
  molecule: Molecule
  expanded?: boolean
}) {
  return (
    <svg
      viewBox="0 0 100 80"
      preserveAspectRatio="xMidYMid meet"
      className={cn('text-text-primary', expanded ? 'h-auto w-full max-w-[300px]' : 'h-[88px] w-[110px]')}
    >
      {(molecule === 'xef2' || molecule === 'xef2-axial-strain') && <WedgeXef2 />}
      {molecule === 'clf3' && <WedgeClf3 />}
    </svg>
  )
}

function WedgeXef2() {
  // F's axial (top and bottom). Lone pairs in the equatorial plane —
  // represented as paired dots in the plane.
  return (
    <g>
      {/* Axial F's */}
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      <AtomLabel x={50} y={40} label="Xe" />
      <AtomLabel x={50} y={10} label="F" />
      <AtomLabel x={50} y={70} label="F" />
      {/* Equatorial lone pair dots — three pairs around Xe */}
      <circle cx={28} cy={42} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={38} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={72} cy={38} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={68} cy={42} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={47} cy={56} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={56} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
    </g>
  )
}

function WedgeClf3() {
  // Two axial F's, one equatorial F with a wedge bond (toward viewer).
  return (
    <g>
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      {/* Equatorial F as a wedge */}
      <polygon points="56,42 78,38 78,46" fill={LEWIS_STROKE} />
      <AtomLabel x={50} y={40} label="Cl" />
      <AtomLabel x={50} y={10} label="F" />
      <AtomLabel x={50} y={70} label="F" />
      <AtomLabel x={84} y={42} label="F" />
      {/* Two equatorial lone pairs */}
      <circle cx={28} cy={42} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={38} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={47} cy={58} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={58} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Geometry chart card — shape name, bond angle, domain count.
// ---------------------------------------------------------------------------

const GEOMETRY_FACTS: Record<Molecule, { shape: string; angle: string; domains: string }> = {
  xef2: {
    shape: 'Linear',
    angle: '180°',
    domains: '2 bonded, 3 lone',
  },
  'xef2-axial-strain': {
    shape: 'Strained (illegal)',
    angle: '—',
    domains: '2 bonded, 3 lone',
  },
  clf3: {
    shape: 'T-shaped',
    angle: '~87.5° axial / 90° eq',
    domains: '3 bonded, 2 lone',
  },
}

function GeometryCard({
  molecule,
  expanded = false,
}: {
  molecule: Molecule
  expanded?: boolean
}) {
  const facts = GEOMETRY_FACTS[molecule]
  return (
    <div className="flex w-full flex-col items-center gap-1 text-center">
      <div
        className={cn(
          'text-text-primary font-medium leading-tight',
          expanded ? 'text-[32px]' : 'text-[11px]',
        )}
      >
        {facts.shape}
      </div>
      <div
        className={cn(
          'text-text-secondary font-mono leading-tight',
          expanded ? 'text-[18px]' : 'text-[10px]',
        )}
      >
        {facts.angle}
      </div>
    </div>
  )
}
