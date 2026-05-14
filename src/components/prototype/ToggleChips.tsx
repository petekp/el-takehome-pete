'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { activeCue, usePrototypeStore } from '@/lib/prototype-store'

/**
 * Viewport controls. The v4 polish removed the always-on chip row in favor
 * of contextual controls that mount only when a beat actually references
 * them. Currently:
 *
 *   - Bond angles — appears when focus === 'axial-bond-angle' or 'closing'.
 *
 * Lone pairs default ON in chipState and stay on for the entire arc; no
 * toggle is shown because every beat depends on seeing them. If no
 * contextual control is currently relevant, this component renders nothing
 * and the row above the viewport collapses cleanly.
 */
export function ViewportControls() {
  const { state, toggleChip } = usePrototypeStore()
  const artifact = state.arc.artifact
  if (!artifact) return null

  const cue = activeCue(artifact)
  const focus = artifact.focus
  const angleContext =
    focus === 'axial-bond-angle' || focus === 'closing' || artifact.chipState.angles

  if (!angleContext) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ControlToggle
        label="Bond angles"
        on={artifact.chipState.angles}
        cued={cue === 'bond-angles-toggle'}
        onToggle={() => toggleChip('angles')}
      />
    </div>
  )
}

function ControlToggle({
  label,
  on,
  cued,
  onToggle,
}: {
  label: string
  on: boolean
  cued: boolean
  onToggle: () => void
}) {
  // Once the user interacts with a cued control, suppress the pulse even
  // if the cue would still match.
  const [tapped, setTapped] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cued) setTapped(false)
  }, [cued])

  const showCue = cued && !tapped

  return (
    <button
      type="button"
      onClick={() => {
        setTapped(true)
        onToggle()
      }}
      aria-pressed={on}
      className={cn(
        'group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]',
        'transition-colors',
        on
          ? 'border-accent/40 bg-accent/10 text-accent-strong'
          : 'border-border-subtle bg-page text-text-tertiary hover:bg-state-hover hover:text-text-secondary',
        showCue && 'shadow-[0_0_0_3px_rgba(0,139,255,0.18)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block size-1.5 rounded-full transition-colors',
          on ? 'bg-accent-strong' : 'bg-text-tertiary/40',
        )}
      />
      <span>{label}</span>
      {showCue && (
        <span
          aria-hidden
          className="border-accent/40 bg-accent/15 absolute -inset-0.5 -z-10 animate-[cuePulse_1600ms_ease-in-out_infinite] rounded-full border"
        />
      )}
    </button>
  )
}
