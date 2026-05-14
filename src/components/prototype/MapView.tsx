'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { usePrototypeStore } from '@/lib/prototype-store'
import { getConcept } from '@/lib/concepts'

/**
 * Side-panel map. Warm radial halo, central solid node (the concept the user
 * just explored), four ghost nodes for adjacent concepts, a sprinkle of
 * atmospheric outer-ring dots for ambient density.
 *
 * Interactions:
 *   - Click the central node → enterWorkshop (replaces this view with the
 *     workshop in the same panel).
 *   - Click a ghost node → reveal its hint in a small banner below the map.
 *     Ghosts do not navigate (per KICKOFF spec).
 *
 * This is the rough stub for step 3 of the build sequence. Final polish
 * (positioning, halo treatment, hint animation) lands in step 6.
 */
export function MapView() {
  const { state, enterWorkshop } = usePrototypeStore()
  const [selectedGhost, setSelectedGhost] = useState<string | null>(null)

  if (!state.arc.conceptId) return null
  const concept = getConcept(state.arc.conceptId)
  // Live API ghosts when available; registry fallback otherwise. Both go
  // through the same .slice(0, 4) so we always have a stable four-node layout.
  const ghosts = (state.arc.ghostNodes ?? concept.descriptors.fallback.ghostNodes).slice(0, 4)

  return (
    <div className="flex flex-col gap-4">
      <svg viewBox="0 0 432 432" className="block w-full" aria-label="Concept map">
        <defs>
          <radialGradient id="map-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
            <stop offset="55%" stopColor="var(--color-accent)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Warm halo */}
        <circle cx={216} cy={216} r={210} fill="url(#map-halo)" />

        {/* Atmospheric outer-ring dots — scattered around the halo edge */}
        {OUTER_DOTS.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="var(--color-text-tertiary)"
            opacity={d.opacity}
          />
        ))}

        {/* Ghost nodes (adjacent concepts) */}
        {ghosts.map((ghost, i) => {
          const pos = GHOST_POSITIONS[i]
          const isSelected = selectedGhost === ghost.id
          return (
            <g
              key={ghost.id}
              className="cursor-pointer"
              onClick={() =>
                setSelectedGhost((current) => (current === ghost.id ? null : ghost.id))
              }
              aria-label={`Adjacent concept: ${ghost.label}`}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={22}
                fill="var(--color-page)"
                stroke="var(--color-accent)"
                strokeWidth={1.25}
                strokeDasharray="3 4"
                opacity={isSelected ? 1 : 0.65}
              />
              <text
                x={pos.x}
                y={pos.labelY}
                textAnchor="middle"
                fill="var(--color-text-tertiary)"
                fontSize={11}
                fontFamily="var(--font-sans)"
                fontWeight={isSelected ? 500 : 400}
              >
                {ghost.label}
              </text>
            </g>
          )
        })}

        {/* Central node — the explored concept */}
        <g className="cursor-pointer" onClick={enterWorkshop} aria-label="Enter workshop">
          <circle
            cx={216}
            cy={216}
            r={38}
            fill="var(--color-accent-strong)"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeOpacity={0.35}
          />
        </g>
        <text
          x={216}
          y={284}
          textAnchor="middle"
          fill="var(--color-text-primary)"
          fontSize={12}
          fontFamily="var(--font-sans)"
          fontWeight={500}
        >
          {concept.descriptors.title.length > 38
            ? `${concept.descriptors.title.slice(0, 36)}…`
            : concept.descriptors.title}
        </text>
      </svg>

      {/* Ghost hint banner */}
      <div className="min-h-[64px]">
        {selectedGhost ? (
          <GhostHint hint={ghosts.find((g) => g.id === selectedGhost)?.hint ?? ''} />
        ) : (
          <p className="text-text-tertiary text-xs italic">
            Tap a dashed node to see what it points to.
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

// Hand-placed positions for the four ghost nodes — four corners of a square
// inset from the halo's edge. labelY sits below each node.
const GHOST_POSITIONS = [
  { x: 96, y: 112, labelY: 88 },
  { x: 336, y: 112, labelY: 88 },
  { x: 336, y: 320, labelY: 360 },
  { x: 96, y: 320, labelY: 360 },
]

// Sparse, hand-placed atmospheric dots. Loose constellation, not perfectly even.
const OUTER_DOTS = [
  { x: 56, y: 200, r: 2, opacity: 0.18 },
  { x: 384, y: 240, r: 1.5, opacity: 0.16 },
  { x: 200, y: 48, r: 2, opacity: 0.2 },
  { x: 248, y: 392, r: 1.5, opacity: 0.14 },
  { x: 72, y: 376, r: 1.5, opacity: 0.12 },
  { x: 376, y: 76, r: 2, opacity: 0.18 },
  { x: 40, y: 132, r: 1.5, opacity: 0.15 },
  { x: 400, y: 348, r: 1.5, opacity: 0.13 },
  { x: 168, y: 28, r: 1.25, opacity: 0.12 },
  { x: 304, y: 404, r: 1.25, opacity: 0.12 },
  { x: 20, y: 252, r: 1.25, opacity: 0.1 },
  { x: 412, y: 168, r: 1.25, opacity: 0.1 },
]
