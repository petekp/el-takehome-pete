'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrototypeStore, type ChipKey } from '@/lib/prototype-store'

/**
 * Toggle chips above the 3D viewport. Each chip flips a bit in
 * `arc.artifact.chipState`; MoleculeScene reads chipState and re-renders the
 * appropriate primitives (bonds, lone-pair ellipsoids, orbital lobes,
 * bond-angle arc + degree label).
 *
 * Atoms is locked on — it's always rendered. We surface it as a chip anyway
 * so the user can see the full set of "what you can show" and learn what
 * each toggle means.
 */

type ChipMeta = {
  key: 'atoms' | ChipKey
  label: string
  locked?: boolean
}

const CHIPS: ChipMeta[] = [
  { key: 'atoms', label: 'Atoms', locked: true },
  { key: 'bonds', label: 'Bonds' },
  { key: 'lonePairs', label: 'Lone pairs' },
  { key: 'orbitals', label: 'Orbital lobes' },
  { key: 'angles', label: 'Bond angles' },
]

export function ToggleChips() {
  const { state, toggleChip } = usePrototypeStore()
  const chipState = state.arc.artifact?.chipState
  if (!chipState) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CHIPS.map((chip) => {
        const on = chip.locked ? true : chipState[chip.key as ChipKey]
        const handleClick = () => {
          if (chip.locked) return
          toggleChip(chip.key as ChipKey)
        }
        return (
          <button
            key={chip.key}
            type="button"
            onClick={handleClick}
            disabled={chip.locked}
            aria-pressed={chip.locked ? undefined : on}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
              'transition-colors',
              on
                ? 'border-accent/40 bg-accent/10 text-accent-strong'
                : 'border-border-subtle bg-page text-text-tertiary hover:bg-state-hover hover:text-text-secondary',
              chip.locked && 'cursor-default opacity-80 hover:bg-accent/10 hover:text-accent-strong',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'inline-block size-1.5 rounded-full transition-colors',
                on ? 'bg-accent-strong' : 'bg-text-tertiary/40',
              )}
            />
            <span>{chip.label}</span>
            {chip.locked && <Lock className="ml-0.5 size-2.5 opacity-60" />}
          </button>
        )
      })}
    </div>
  )
}
