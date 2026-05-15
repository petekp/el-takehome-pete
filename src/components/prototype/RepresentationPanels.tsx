'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { activeCue, usePrototypeStore, type RepresentationPanelId } from '@/lib/prototype-store'
import type { ElementCue, Molecule } from '@/lib/artifact-script'
import type { ImageAttachment } from '@/lib/types'

/**
 * The View select menu — surfaces the literacy representations the user
 * can apply as a 3D treatment.
 *
 * Two cards (down from three: wedge-and-dash was removed because for linear
 * XeF2 it produces a misleading or trivially-flat view):
 *   - Lewis structure   (3D viewport flattens to a 2D-style view)
 *   - Molecular geometry (3D viewport foregrounds shape name + angle)
 *
 * The 2D diagrams render in the right pane next to the bubble so the user
 * sees the literal 2D representation alongside the explanation. A bubble
 * can broadcast a cue ('panel-lewis', 'panels-row', …) which pulses the
 * matching card(s) softly until the user clicks them.
 */

type LiteracyPanelId = Exclude<RepresentationPanelId, 'materials'>

type PanelMeta = {
  id: LiteracyPanelId
  label: string
}

const PANELS: PanelMeta[] = [
  { id: 'lewis', label: 'Lewis structure' },
  { id: 'geometry', label: 'Molecular geometry' },
]

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
  return <GeometryCard molecule={molecule} expanded={expanded} />
}

function cueMatchesPanel(cue: ElementCue | null, panel: LiteracyPanelId): boolean {
  if (!cue) return false
  if (cue === 'panels-row') return true
  if (cue === 'panel-lewis') return panel === 'lewis'
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
              {/* eslint-disable-next-line @next/next/no-img-element -- enlarged user attachment data URLs are not static optimized assets. */}
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

type BondDirection = 'up' | 'down' | 'left' | 'right'

/** F atom (octet) — bond on one side, three lone pairs on the other three.
 *  Each lone pair is a 2-dot cluster oriented perpendicular to its radial
 *  axis so the pair sits "around" the atom rather than pointing away. The
 *  radial OFFSET clears the 11-unit-tall F glyph by a comfortable margin so
 *  the up/down pairs don't visually merge with the label. */
function FluorineWithLonePairs({
  cx,
  cy,
  bondDirection,
}: {
  cx: number
  cy: number
  bondDirection: BondDirection
}) {
  const sides: BondDirection[] = (['up', 'down', 'left', 'right'] as const).filter(
    (s) => s !== bondDirection,
  )
  const r = LEWIS_DOT_R / 1.4
  const RADIAL_OFFSET = 7.5
  const PAIR_GAP = 1.6
  return (
    <g>
      <AtomLabel x={cx} y={cy} label="F" />
      {sides.map((side) => {
        if (side === 'up') {
          return (
            <g key={side}>
              <circle cx={cx - PAIR_GAP} cy={cy - RADIAL_OFFSET} r={r} fill={LEWIS_STROKE} />
              <circle cx={cx + PAIR_GAP} cy={cy - RADIAL_OFFSET} r={r} fill={LEWIS_STROKE} />
            </g>
          )
        }
        if (side === 'down') {
          return (
            <g key={side}>
              <circle cx={cx - PAIR_GAP} cy={cy + RADIAL_OFFSET} r={r} fill={LEWIS_STROKE} />
              <circle cx={cx + PAIR_GAP} cy={cy + RADIAL_OFFSET} r={r} fill={LEWIS_STROKE} />
            </g>
          )
        }
        if (side === 'left') {
          return (
            <g key={side}>
              <circle cx={cx - RADIAL_OFFSET} cy={cy - PAIR_GAP} r={r} fill={LEWIS_STROKE} />
              <circle cx={cx - RADIAL_OFFSET} cy={cy + PAIR_GAP} r={r} fill={LEWIS_STROKE} />
            </g>
          )
        }
        return (
          <g key={side}>
            <circle cx={cx + RADIAL_OFFSET} cy={cy - PAIR_GAP} r={r} fill={LEWIS_STROKE} />
            <circle cx={cx + RADIAL_OFFSET} cy={cy + PAIR_GAP} r={r} fill={LEWIS_STROKE} />
          </g>
        )
      })}
    </g>
  )
}

function LewisXef2() {
  // F-Xe-F drawn vertically. The three Xe lone pairs are placed in clearly
  // unbonded positions around Xe so no glyph intersects a bond, label, or
  // another LP. With the vertical bond axis blocking 12 and 6 o'clock, we
  // stack two LPs on the left side and put the third on the right.
  return (
    <g>
      {/* Bonds first so the dots layer on top if anything were close */}
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      {/* LP 1 — middle-left horizontal pair */}
      <circle cx={28} cy={40} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={40} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* LP 2 — upper-left horizontal pair */}
      <circle cx={28} cy={32} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={32} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* LP 3 — middle-right horizontal pair */}
      <circle cx={68} cy={40} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={72} cy={40} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <AtomLabel x={50} y={40} label="Xe" />
      <FluorineWithLonePairs cx={50} cy={10} bondDirection="down" />
      <FluorineWithLonePairs cx={50} cy={70} bondDirection="up" />
    </g>
  )
}

function LewisClf3() {
  // T-shaped: three F bonds (axial up, axial down, equatorial right) plus
  // two lone pairs on Cl. Both LPs sit on the bondless left side, stacked
  // so neither overlaps the right-side equatorial bond.
  return (
    <g>
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      <Bond x1={50} y1={40} x2={84} y2={40} />
      {/* LP 1 — upper-left pair */}
      <circle cx={28} cy={32} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={32} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* LP 2 — lower-left pair */}
      <circle cx={28} cy={48} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={32} cy={48} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <AtomLabel x={50} y={40} label="Cl" />
      <FluorineWithLonePairs cx={50} cy={10} bondDirection="down" />
      <FluorineWithLonePairs cx={50} cy={70} bondDirection="up" />
      <FluorineWithLonePairs cx={88} cy={40} bondDirection="left" />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Molecular-geometry card — shape name + characteristic bond angle.
// ---------------------------------------------------------------------------

const GEOMETRY_FACTS: Record<Molecule, { shape: string; angle: string; domains: string }> = {
  xef2: {
    shape: 'Linear',
    angle: 'F–Xe–F = 180°',
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
