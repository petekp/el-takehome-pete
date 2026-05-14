'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { usePrototypeStore, type RepresentationPanelId } from '@/lib/prototype-store'
import type { Molecule } from '@/lib/artifact-script'

/**
 * The row of clickable representation panels beneath the 3D viewport.
 *
 * Each panel renders the current `activeMolecule` in a different 2D
 * notation. Clicking a panel:
 *   1. Counts toward the Beat-3 explore gate (panelsClicked is the spine).
 *   2. Enters "annotation mode" on the 3D scene: parts that representation
 *      omits fade out, parts it captures stay prominent. The 3D viewport
 *      reads `activePanel` and applies the fade.
 *
 * The point of the mechanic, said plainly, is REPRESENTATION LITERACY:
 * each notation captures some aspects of the molecule and omits others.
 * Learning to read them as lenses (not as rules to memorize) is the move.
 */

type PanelMeta = {
  id: RepresentationPanelId
  label: string
  /** Brief description of what this representation captures — shown as a
   *  sub-line in the panel and surfaced in the 3D scene's annotation overlay. */
  tellsYou: string
  /** What this representation omits. */
  omits: string
  /** Renders the schematic for the given molecule. */
  Render: (props: { molecule: Molecule }) => ReactNode
}

const PANELS: PanelMeta[] = [
  {
    id: 'lewis',
    label: 'Lewis structure',
    tellsYou: 'Electron bookkeeping — bonded pairs and lone pairs.',
    omits: '3D geometry. Bond angles.',
    Render: LewisDiagram,
  },
  {
    id: 'wedge',
    label: 'Wedge-and-dash',
    tellsYou: 'Bond directions: in plane, toward you (wedge), behind (dash).',
    omits: 'The shape of lone-pair electron density.',
    Render: WedgeDashDiagram,
  },
  {
    id: 'geometry',
    label: 'Geometry chart',
    tellsYou: 'Shape name. Bond angle. Electron-domain geometry.',
    omits: 'Visual structure. Where the lone pairs sit.',
    Render: GeometryCard,
  },
]

export function RepresentationPanels() {
  const { state, clickPanel } = usePrototypeStore()
  const artifact = state.arc.artifact
  if (!artifact) return null

  return (
    <div className="grid grid-cols-3 gap-2">
      {PANELS.map((p) => {
        const active = artifact.activePanel === p.id
        const explored = artifact.panelsClicked.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => clickPanel(p.id)}
            className={cn(
              'group relative flex flex-col gap-1.5 overflow-hidden rounded-md border p-2.5 text-left',
              'transition-colors',
              active
                ? 'border-accent/50 bg-accent/8 shadow-sm'
                : 'border-border-subtle bg-page hover:border-border-soft hover:bg-state-hover',
            )}
            aria-pressed={active}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'text-[10px] font-medium uppercase tracking-wide',
                  active ? 'text-accent-strong' : 'text-text-tertiary',
                )}
              >
                {p.label}
              </span>
              {explored && !active && (
                <span
                  aria-hidden
                  className="bg-text-tertiary/40 inline-block size-1 rounded-full"
                />
              )}
            </div>
            <div className="flex h-[88px] items-center justify-center">
              <p.Render molecule={artifact.activeMolecule} />
            </div>
            <div className="text-text-tertiary text-[10px] leading-snug">
              {active ? p.tellsYou : ' '}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lewis dot structures (schematic SVGs)
// ---------------------------------------------------------------------------

const LEWIS_DOT_R = 1.8
const LEWIS_STROKE = '#3a3833'
const LEWIS_DIM = '#6b665e'

function LewisDiagram({ molecule }: { molecule: Molecule }) {
  return (
    <svg viewBox="0 0 100 80" className="size-full text-text-primary">
      {molecule === 'methane' && <LewisMethane />}
      {molecule === 'ammonium' && <LewisAmmonium />}
      {molecule === 'ammonia' && <LewisAmmonia />}
      {molecule === 'water' && <LewisWater />}
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
  // Pull the endpoints back from the atom labels so the line doesn't run
  // through the letters.
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

function LewisMethane() {
  // C in the center, 4 H's at cardinal positions, bonds between.
  return (
    <g>
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={78} y2={40} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      <Bond x1={50} y1={40} x2={22} y2={40} />
      <AtomLabel x={50} y={40} label="C" />
      <AtomLabel x={50} y={10} label="H" />
      <AtomLabel x={82} y={40} label="H" />
      <AtomLabel x={50} y={70} label="H" />
      <AtomLabel x={18} y={40} label="H" />
    </g>
  )
}

function LewisAmmonium() {
  return (
    <g>
      <Bond x1={50} y1={40} x2={50} y2={14} />
      <Bond x1={50} y1={40} x2={78} y2={40} />
      <Bond x1={50} y1={40} x2={50} y2={66} />
      <Bond x1={50} y1={40} x2={22} y2={40} />
      <AtomLabel x={50} y={40} label="N" />
      <AtomLabel x={50} y={10} label="H" />
      <AtomLabel x={82} y={40} label="H" />
      <AtomLabel x={50} y={70} label="H" />
      <AtomLabel x={18} y={40} label="H" />
      <text
        x={68}
        y={22}
        fontSize="9"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight={600}
        fill={LEWIS_STROKE}
      >
        +
      </text>
    </g>
  )
}

function LewisAmmonia() {
  // N in center, lone pair on top (two dots), three H below in a fan.
  return (
    <g>
      {/* Lone pair pair-of-dots above N */}
      <circle cx={47} cy={20} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={20} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* Bonds */}
      <Bond x1={50} y1={40} x2={22} y2={68} />
      <Bond x1={50} y1={40} x2={50} y2={70} />
      <Bond x1={50} y1={40} x2={78} y2={68} />
      <AtomLabel x={50} y={40} label="N" />
      <AtomLabel x={18} y={70} label="H" />
      <AtomLabel x={50} y={74} label="H" />
      <AtomLabel x={82} y={70} label="H" />
    </g>
  )
}

function LewisWater() {
  // O in center, 2 lone pairs (top and right), 2 H below (bent).
  return (
    <g>
      {/* Lone pairs */}
      <circle cx={47} cy={18} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={18} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={78} cy={37} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={78} cy={43} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      {/* Bonds */}
      <Bond x1={50} y1={40} x2={26} y2={66} />
      <Bond x1={50} y1={40} x2={22} y2={56} />
      <AtomLabel x={50} y={40} label="O" />
      <AtomLabel x={22} y={70} label="H" />
      <AtomLabel x={18} y={56} label="H" />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Wedge-and-dash diagrams
// ---------------------------------------------------------------------------

function WedgeDashDiagram({ molecule }: { molecule: Molecule }) {
  return (
    <svg viewBox="0 0 100 80" className="size-full text-text-primary">
      {molecule === 'methane' && <WedgeMethane />}
      {molecule === 'ammonium' && <WedgeAmmonium />}
      {molecule === 'ammonia' && <WedgeAmmonia />}
      {molecule === 'water' && <WedgeWater />}
    </svg>
  )
}

/** Filled triangle pointing from central atom to H (wedge = "out of page"). */
function Wedge({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const tipInset = 7
  const baseInset = 8
  const tipX = x1 + ux * tipInset
  const tipY = y1 + uy * tipInset
  const baseX = x2 - ux * baseInset
  const baseY = y2 - uy * baseInset
  const width = 2.5
  return (
    <polygon
      points={`${tipX},${tipY} ${baseX + px * width},${baseY + py * width} ${baseX - px * width},${baseY - py * width}`}
      fill={LEWIS_STROKE}
    />
  )
}

/** Dashed segments pointing from central atom to H ("into page"). */
function Dash({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const tipInset = 7
  const baseInset = 8
  const segments: ReactNode[] = []
  const segCount = 5
  for (let i = 0; i < segCount; i++) {
    const t = (i + 0.5) / segCount
    const cx = x1 + ux * (tipInset + (len - tipInset - baseInset) * t)
    const cy = y1 + uy * (tipInset + (len - tipInset - baseInset) * t)
    const w = 0.6 + t * 1.6 // grow with distance from central atom
    segments.push(
      <line
        key={i}
        x1={cx + px * w}
        y1={cy + py * w}
        x2={cx - px * w}
        y2={cy - py * w}
        stroke={LEWIS_STROKE}
        strokeWidth={0.8}
        strokeLinecap="round"
      />,
    )
  }
  return <g>{segments}</g>
}

function WedgeMethane() {
  return (
    <g>
      <Bond x1={50} y1={42} x2={26} y2={62} />
      <Bond x1={50} y1={42} x2={74} y2={62} />
      <Wedge x1={50} y1={42} x2={50} y2={70} />
      <Dash x1={50} y1={42} x2={50} y2={14} />
      <AtomLabel x={50} y={42} label="C" />
      <AtomLabel x={22} y={66} label="H" />
      <AtomLabel x={78} y={66} label="H" />
      <AtomLabel x={50} y={74} label="H" />
      <AtomLabel x={50} y={10} label="H" />
    </g>
  )
}

function WedgeAmmonium() {
  return (
    <g>
      <Bond x1={50} y1={42} x2={26} y2={62} />
      <Bond x1={50} y1={42} x2={74} y2={62} />
      <Wedge x1={50} y1={42} x2={50} y2={70} />
      <Dash x1={50} y1={42} x2={50} y2={14} />
      <AtomLabel x={50} y={42} label="N" />
      <AtomLabel x={22} y={66} label="H" />
      <AtomLabel x={78} y={66} label="H" />
      <AtomLabel x={50} y={74} label="H" />
      <AtomLabel x={50} y={10} label="H" />
      <text
        x={68}
        y={26}
        fontSize="9"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight={600}
        fill={LEWIS_STROKE}
      >
        +
      </text>
    </g>
  )
}

function WedgeAmmonia() {
  return (
    <g>
      <Bond x1={50} y1={42} x2={26} y2={62} />
      <Wedge x1={50} y1={42} x2={74} y2={62} />
      <Dash x1={50} y1={42} x2={50} y2={14} />
      <AtomLabel x={50} y={42} label="N" />
      <AtomLabel x={22} y={66} label="H" />
      <AtomLabel x={78} y={66} label="H" />
      <AtomLabel x={50} y={10} label="H" />
      {/* Lone pair as small pair of dots above N */}
      <circle cx={43} cy={30} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={43} cy={36} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
    </g>
  )
}

function WedgeWater() {
  return (
    <g>
      <Bond x1={50} y1={42} x2={22} y2={62} />
      <Bond x1={50} y1={42} x2={78} y2={62} />
      <AtomLabel x={50} y={42} label="O" />
      <AtomLabel x={18} y={66} label="H" />
      <AtomLabel x={82} y={66} label="H" />
      {/* Two lone pairs */}
      <circle cx={47} cy={22} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={22} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={47} cy={28} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
      <circle cx={53} cy={28} r={LEWIS_DOT_R} fill={LEWIS_STROKE} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Geometry + facts card
// ---------------------------------------------------------------------------

const GEOMETRY_FACTS: Record<Molecule, { shape: string; angle: string; domains: string }> = {
  methane: {
    shape: 'Tetrahedral',
    angle: '109.5°',
    domains: '4 bonded, 0 lone',
  },
  ammonium: {
    shape: 'Tetrahedral',
    angle: '109.5°',
    domains: '4 bonded, 0 lone',
  },
  ammonia: {
    shape: 'Trigonal pyramidal',
    angle: '~107°',
    domains: '3 bonded, 1 lone',
  },
  water: {
    shape: 'Bent',
    angle: '~104.5°',
    domains: '2 bonded, 2 lone',
  },
}

function GeometryCard({ molecule }: { molecule: Molecule }) {
  const facts = GEOMETRY_FACTS[molecule]
  return (
    <div className="flex w-full flex-col gap-1 px-1 text-left">
      <div className="text-text-primary text-[12px] font-medium leading-tight">{facts.shape}</div>
      <div className="text-text-secondary font-mono text-[11px] leading-tight">{facts.angle}</div>
      <div className="text-text-tertiary text-[9.5px] leading-tight">{facts.domains}</div>
      <div className="text-text-tertiary text-[9.5px] leading-tight">
        Electron domain: tetrahedral
      </div>
    </div>
  )
}
