'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EVOLUTION_STEPS } from '@/lib/evolution-data'

/**
 * Scrubber over the prototype's git history — for narrating "how this thing
 * evolved" during the walkthrough recording. Static screenshots per commit;
 * captions cued to what changed at each step. Keyboard ←/→ and Home/End to
 * jump through; clicking a timeline tick jumps directly.
 */
export default function EvolutionPage() {
  const [index, setIndex] = useState(0)
  const step = EVOLUTION_STEPS[index]!
  const total = EVOLUTION_STEPS.length

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next))
      setIndex(clamped)
    },
    [total],
  )

  // Keyboard nav. Hooked to document so the user doesn't have to focus the
  // scrubber first — useful when narrating with the cursor parked elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        go(index + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(index - 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        go(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        go(total - 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, index, total])

  return (
    <div className="bg-page fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden">
      <Header index={index} total={total} />

      <main className="flex min-h-0 flex-1 flex-col px-8 pb-4">
        <ImageStage step={step} />
        <Caption step={step} index={index} total={total} />
      </main>

      <Scrubber index={index} total={total} onJump={go} onPrev={() => go(index - 1)} onNext={() => go(index + 1)} />
    </div>
  )
}

function Header({ index, total }: { index: number; total: number }) {
  return (
    <header className="flex items-center justify-between px-8 pt-6 pb-4">
      <div>
        <h1 className="text-text-primary font-serif text-2xl tracking-tight">
          How the artifact evolved
        </h1>
        <p className="text-text-tertiary mt-1 text-sm">
          Seven commits, two days. Use ← → to scrub.
        </p>
      </div>
      <div className="text-text-tertiary font-mono text-xs">
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
    </header>
  )
}

function ImageStage({ step }: { step: (typeof EVOLUTION_STEPS)[number] }) {
  return (
    <div className="border-border-soft bg-surface relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border shadow-input">
      {/* Plain img tag — we re-capture screenshots over the same filenames
          during iteration, and Next.js Image's optimization layer holds onto
          older bytes longer than we want. Querystring cache-buster lets the
          browser fetch the latest each time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={step.image}
        src={step.image}
        alt={step.imageAlt}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  )
}

function Caption({
  step,
  index,
  total,
}: {
  step: (typeof EVOLUTION_STEPS)[number]
  index: number
  total: number
}) {
  return (
    <div className="mt-4 grid grid-cols-12 gap-6">
      <div className="col-span-3 flex flex-col gap-1">
        <span className="text-text-tertiary text-[11px] font-medium tracking-wide uppercase">
          Step {index + 1} of {total}
        </span>
        <span className="text-text-secondary font-mono text-xs">{step.sha}</span>
        <span className="text-text-secondary text-xs">{step.date}</span>
        <span className="text-accent-strong mt-1 text-xs font-medium">{step.era}</span>
      </div>
      <div className="col-span-9">
        <h2 className="text-text-primary font-serif text-lg leading-tight">{step.title}</h2>
        <p className="text-text-secondary mt-2 text-sm leading-relaxed">{step.story}</p>
      </div>
    </div>
  )
}

function Scrubber({
  index,
  total,
  onJump,
  onPrev,
  onNext,
}: {
  index: number
  total: number
  onJump: (i: number) => void
  onPrev: () => void
  onNext: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const positions = useMemo(
    () => Array.from({ length: total }, (_, i) => (total === 1 ? 0 : (i / (total - 1)) * 100)),
    [total],
  )

  const jumpFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      // Snap to nearest tick.
      const target = Math.round(ratio * (total - 1))
      onJump(target)
    },
    [onJump, total],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    jumpFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    jumpFromClientX(e.clientX)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }

  return (
    <footer className="border-border-soft bg-surface-dim/60 flex items-center gap-4 border-t px-8 py-5">
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0}
        className={cn(
          'border-border-subtle hover:bg-state-hover flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-30',
        )}
        aria-label="Previous step"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-9 flex-1 cursor-pointer select-none"
        role="slider"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        tabIndex={0}
      >
        {/* Track */}
        <div className="bg-border-subtle absolute top-1/2 left-0 h-px w-full -translate-y-1/2" />
        {/* Progress */}
        <div
          className="bg-accent-strong absolute top-1/2 left-0 h-px -translate-y-1/2 transition-[width] duration-200"
          style={{ width: `${positions[index]}%` }}
        />
        {/* Ticks */}
        {positions.map((pos, i) => {
          const active = i === index
          const passed = i < index
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className={cn(
                'absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-all',
                active
                  ? 'bg-accent-strong size-3 shadow-[0_0_0_4px_rgba(0,114,214,0.18)]'
                  : passed
                    ? 'bg-accent-strong size-2 hover:size-2.5'
                    : 'bg-border-subtle hover:bg-text-tertiary size-2 hover:size-2.5',
              )}
              style={{ left: `${pos}%` }}
              aria-label={`Step ${i + 1}: ${EVOLUTION_STEPS[i]!.title}`}
            >
              <span className="sr-only">{EVOLUTION_STEPS[i]!.title}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={index === total - 1}
        className={cn(
          'border-border-subtle hover:bg-state-hover flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-30',
        )}
        aria-label="Next step"
      >
        <ChevronRight className="size-4" />
      </button>
    </footer>
  )
}
