'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { usePrototypeStore } from '@/lib/prototype-store'
import { getConcept } from '@/lib/concepts'

/**
 * Side-panel map. The user's explored concept sits at the center; adjacent
 * concepts radiate outward as pills along an asterisk-shaped spark. The
 * geometry intentionally evokes the Claude logomark — four long cardinal
 * rays + two shorter diagonal rays + two short decorative rays at the other
 * diagonals — so the map reads as a "spark" of related concepts rather than
 * a uniform grid.
 *
 *   - Cardinals (N/E/S/W): the four most directly adjacent concepts.
 *   - Diagonals (NE/SW): two supporting concepts.
 *   - Decorative rays (NW/SE): no pill; pure stroke, for the asterisk shape.
 *
 * Interactions:
 *   - Click the central pill → enterWorkshop.
 *   - Click a ghost pill → reveal its hint in the banner below. Ghosts don't
 *     navigate (per KICKOFF spec).
 */
const MAP_W = 432
const MAP_H = 360
const CX = MAP_W / 2 // center x
const CY = MAP_H / 2 // center y

// One position entry per ghost slot. Cardinals first (long rays), then
// diagonals (short rays). The order matches the ghostNodes registry order so
// ghosts[i] lands at POSITIONS[i].
const POSITIONS = [
  // Cardinals — long rays, 90° apart
  { x: CX, y: CY - 150, tier: 'cardinal' as const }, // N
  { x: CX + 175, y: CY, tier: 'cardinal' as const }, // E
  { x: CX, y: CY + 150, tier: 'cardinal' as const }, // S
  { x: CX - 175, y: CY, tier: 'cardinal' as const }, // W
  // Diagonals — shorter rays, mid-asterisk
  { x: CX + 100, y: CY - 100, tier: 'diagonal' as const }, // NE
  { x: CX - 100, y: CY + 100, tier: 'diagonal' as const }, // SW
]

// Pure-decorative rays at the remaining diagonals (NW, SE). No pill, just the
// stroke — completes the asterisk silhouette without crowding the map with
// labels.
const DECORATIVE_RAYS = [
  { x: CX - 90, y: CY - 90 }, // NW
  { x: CX + 90, y: CY + 90 }, // SE
]

export function MapView() {
  const { state, enterWorkshop } = usePrototypeStore()
  const [selectedGhost, setSelectedGhost] = useState<string | null>(null)

  if (!state.arc.conceptId) return null
  const concept = getConcept(state.arc.conceptId)
  const ghosts = (state.arc.ghostNodes ?? concept.descriptors.fallback.ghostNodes).slice(0, 6)

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative mx-auto w-full"
        style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, maxWidth: MAP_W }}
        aria-label="Concept map"
        role="group"
      >
        {/* Spark rays — SVG underlay. Drawn from center to each ray endpoint.
            Stroke thickness + opacity vary by tier so cardinals read as the
            primary branches, diagonals as supporting, and decorative rays as
            ambient. */}
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {POSITIONS.map((p, i) => (
            <line
              key={`ray-${i}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-accent)"
              strokeWidth={p.tier === 'cardinal' ? 1.5 : 1}
              strokeOpacity={p.tier === 'cardinal' ? 0.45 : 0.3}
              strokeLinecap="round"
            />
          ))}
          {DECORATIVE_RAYS.map((p, i) => (
            <line
              key={`dec-${i}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-accent)"
              strokeWidth={1}
              strokeOpacity={0.22}
              strokeLinecap="round"
            />
          ))}
          {/* Small dots at the tips of the decorative rays — feels like the
              ray "lands" somewhere, even without a label. */}
          {DECORATIVE_RAYS.map((p, i) => (
            <circle
              key={`dec-tip-${i}`}
              cx={p.x}
              cy={p.y}
              r={2.5}
              fill="var(--color-accent)"
              opacity={0.35}
            />
          ))}
        </svg>

        {/* Ghost pills — positioned over the ray endpoints. */}
        {ghosts.map((ghost, i) => {
          const pos = POSITIONS[i]
          if (!pos) return null
          const isSelected = selectedGhost === ghost.id
          return (
            <button
              key={ghost.id}
              type="button"
              onClick={() =>
                setSelectedGhost((current) => (current === ghost.id ? null : ghost.id))
              }
              aria-label={`Adjacent concept: ${ghost.label}`}
              aria-pressed={isSelected}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2',
                'border-accent/55 bg-page',
                'cursor-pointer rounded-full border whitespace-nowrap',
                'transition-[opacity,border-color,color] duration-200',
                'hover:text-text-secondary hover:border-accent/80',
                pos.tier === 'cardinal'
                  ? 'px-3 py-1.5 text-[11px] leading-none'
                  : 'px-2.5 py-1 text-[10px] leading-none',
                isSelected ? 'text-text-primary border-accent opacity-100' : 'text-text-tertiary opacity-75',
              )}
              style={{
                left: `${(pos.x / MAP_W) * 100}%`,
                top: `${(pos.y / MAP_H) * 100}%`,
                borderStyle: 'dashed',
              }}
            >
              {ghost.label}
            </button>
          )
        })}

        {/* Central pill — the explored concept */}
        <button
          type="button"
          onClick={enterWorkshop}
          aria-label={`Enter workshop: ${concept.descriptors.title}`}
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-accent-strong text-page',
            'cursor-pointer rounded-full px-5 py-2.5 text-sm font-medium leading-none',
            'whitespace-nowrap transition-transform duration-200 hover:scale-[1.03]',
            'shadow-[0_1px_2px_rgba(20,20,19,0.08)]',
          )}
        >
          {concept.descriptors.title}
        </button>
      </div>

      {/* Ghost hint banner */}
      <div className="min-h-[64px]">
        {selectedGhost ? (
          <GhostHint hint={ghosts.find((g) => g.id === selectedGhost)?.hint ?? ''} />
        ) : (
          <p className="text-text-tertiary text-xs italic">
            Tap a dashed pill to see what it points to.
          </p>
        )}
      </div>
    </div>
  )
}

function GhostHint({ hint }: { hint: string }) {
  return (
    <div
      className={cn(
        'border-border-soft text-text-secondary border-l-2 pl-3 text-sm leading-snug',
      )}
    >
      {hint}
    </div>
  )
}
