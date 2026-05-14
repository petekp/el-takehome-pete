'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { usePrototypeStore } from '@/lib/prototype-store'
import { getConcept, type PredictionOption } from '@/lib/concepts'
import { WorkshopChat } from './WorkshopChat'

/**
 * Interactive Promise.all workshop. The bland static stub from Beat 6 is gone
 * — this surface is now a real exploration space (PRD §4 / KICKOFF Step 5):
 *
 *   - Two-column layout inside a 720px-wide panel (viz left, chat right).
 *   - Per-track outcome pickers (resolve / reject / hang) + time sliders.
 *   - Preset scenario chips: "Two resolve, one hangs" (the truth), "All
 *     resolve", "One rejects", "Two reject (staggered)".
 *   - raf-driven Play animation: markers traverse the rails, the aggregate
 *     row updates live, hangs visibly extend past the rail.
 *   - The opening predict-reveal plays out IN the viz: the prediction sets
 *     the config to the truth scenario and auto-plays. The reveal text on the
 *     right is a small caption — the viz IS the reveal.
 *
 * State is local to this component on purpose. The arc store carries durable
 * concept/prediction/reflection state; the workshop's transient track config
 * and playback are scratch space the user can churn through freely.
 */

const MAX_TIME = 1000 // ms — full rail length
const PLAY_DURATION_MS = 1600 // wall-clock length of one play
const TIME_OVERSHOOT = 1.25 // we animate past MAX_TIME so hangs visibly extend off the rail

type Outcome = 'resolve' | 'reject' | 'hang'
type TrackConfig = { id: string; label: string; outcome: Outcome; time: number }
type PresetKey = 'truth' | 'allResolve' | 'oneRejects' | 'twoRejectStaggered'
type Preset = { key: PresetKey; label: string; tracks: TrackConfig[] }

const PRESETS: Record<PresetKey, Preset> = {
  truth: {
    key: 'truth',
    label: 'Two resolve · one hangs',
    tracks: [
      { id: 'a', label: 'fetch A', outcome: 'resolve', time: 200 },
      { id: 'b', label: 'fetch B', outcome: 'resolve', time: 280 },
      { id: 'c', label: 'fetch C', outcome: 'hang', time: 0 },
    ],
  },
  allResolve: {
    key: 'allResolve',
    label: 'All resolve',
    tracks: [
      { id: 'a', label: 'fetch A', outcome: 'resolve', time: 200 },
      { id: 'b', label: 'fetch B', outcome: 'resolve', time: 480 },
      { id: 'c', label: 'fetch C', outcome: 'resolve', time: 720 },
    ],
  },
  oneRejects: {
    key: 'oneRejects',
    label: 'One rejects',
    tracks: [
      { id: 'a', label: 'fetch A', outcome: 'resolve', time: 200 },
      { id: 'b', label: 'fetch B', outcome: 'reject', time: 400 },
      { id: 'c', label: 'fetch C', outcome: 'resolve', time: 700 },
    ],
  },
  twoRejectStaggered: {
    key: 'twoRejectStaggered',
    label: 'Two reject · staggered',
    tracks: [
      { id: 'a', label: 'fetch A', outcome: 'reject', time: 300 },
      { id: 'b', label: 'fetch B', outcome: 'resolve', time: 500 },
      { id: 'c', label: 'fetch C', outcome: 'reject', time: 750 },
    ],
  },
}

const PRESET_ORDER: PresetKey[] = ['truth', 'allResolve', 'oneRejects', 'twoRejectStaggered']

/**
 * Promise.all semantics, evaluated against a virtual clock t:
 *  - First rejection (at or before t) wins → aggregate rejected at that time.
 *  - Else if any track is configured to hang → aggregate stays pending forever.
 *  - Else if all tracks resolve → aggregate resolves at max(track.time) once t reaches it.
 *  - Otherwise pending (mid-flight, waiting for the slowest).
 */
type Aggregate =
  | { kind: 'pending'; cause: 'waiting' | 'hang'; hangTrack?: string }
  | { kind: 'resolved'; at: number }
  | { kind: 'rejected'; at: number; by: string }

function deriveAggregate(tracks: TrackConfig[], t: number): Aggregate {
  const firedRejects = tracks
    .filter((tr) => tr.outcome === 'reject' && t >= tr.time)
    .sort((a, b) => a.time - b.time)
  if (firedRejects.length > 0) {
    return { kind: 'rejected', at: firedRejects[0].time, by: firedRejects[0].label }
  }
  const hangs = tracks.filter((tr) => tr.outcome === 'hang')
  if (hangs.length > 0) {
    return { kind: 'pending', cause: 'hang', hangTrack: hangs[0].label }
  }
  const allResolve = tracks.every((tr) => tr.outcome === 'resolve')
  if (allResolve) {
    const settleAt = Math.max(...tracks.map((tr) => tr.time))
    if (t >= settleAt) return { kind: 'resolved', at: settleAt }
    return { kind: 'pending', cause: 'waiting' }
  }
  // Mixed config where rejects haven't fired yet — still pending.
  return { kind: 'pending', cause: 'waiting' }
}

export function WorkshopView() {
  const { state, setSidePanel } = usePrototypeStore()
  const [tracks, setTracks] = useState<TrackConfig[]>(PRESETS.truth.tracks)
  const [currentTime, setCurrentTime] = useState(MAX_TIME * TIME_OVERSHOOT)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [activePreset, setActivePreset] = useState<PresetKey | null>('truth')
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  // Cleanup raf if the user leaves the workshop mid-animation.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const play = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    setIsPlaying(true)
    setCurrentTime(0)
    startRef.current = performance.now()
    const target = MAX_TIME * TIME_OVERSHOOT
    const tick = () => {
      const elapsed = performance.now() - startRef.current
      const progress = Math.min(elapsed / PLAY_DURATION_MS, 1)
      // Quadratic ease-out — clock feels less mechanical at the tail.
      const eased = 1 - Math.pow(1 - progress, 2)
      setCurrentTime(eased * target)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
        setIsPlaying(false)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const settleToEnd = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setIsPlaying(false)
    setCurrentTime(MAX_TIME * TIME_OVERSHOOT)
  }, [])

  const applyPreset = useCallback(
    (key: PresetKey) => {
      setTracks(PRESETS[key].tracks)
      setActivePreset(key)
      settleToEnd()
    },
    [settleToEnd],
  )

  const updateTrack = useCallback(
    (id: string, patch: Partial<TrackConfig>) => {
      setTracks((ts) => ts.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)))
      setActivePreset(null) // user has diverged from any named preset
      settleToEnd()
    },
    [settleToEnd],
  )

  if (!state.arc.conceptId) return null
  const concept = getConcept(state.arc.conceptId)
  const title = state.arc.cardMeta?.conceptTitle ?? concept.descriptors.title
  const framing =
    state.arc.workshopOpening?.framing ?? concept.descriptors.fallback.workshopOpening.framing
  const options: PredictionOption[] =
    state.arc.predictionOptions?.options ??
    concept.descriptors.fallback.workshopOpening.options

  const handlePredictSubmit = (id: string) => {
    setSelectedOptionId(id)
    // The opening reveal IS the viz: snap the config to the truth scenario
    // (it already is, but be defensive in case the user moved sliders pre-submit)
    // and play. The user watches the prediction land in the visualization
    // rather than reading about it.
    setTracks(PRESETS.truth.tracks)
    setActivePreset('truth')
    // Defer play one frame so the setTracks state has landed.
    requestAnimationFrame(() => play())
  }

  const showReveal = selectedOptionId !== null
  const chosen = showReveal ? options.find((o) => o.id === selectedOptionId) : undefined

  return (
    <div className="flex flex-col gap-4">
      <BackBar title={title} onBack={() => setSidePanel({ view: 'map' })} />

      <div className="grid grid-cols-[3fr_2fr] gap-5">
        {/* Left column — interactive visualization */}
        <section className="flex min-w-0 flex-col gap-4">
          <PresetChips active={activePreset} onPick={applyPreset} />

          <TimelineViz
            tracks={tracks}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onUpdateTrack={updateTrack}
          />

          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={play} disabled={isPlaying}>
              <Play className="size-3.5" />
              Play
            </Button>
            <Button size="sm" variant="ghost" onClick={settleToEnd} disabled={isPlaying}>
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
            {isPlaying && (
              <span className="text-text-tertiary text-xs tabular-nums">
                t = {Math.round(currentTime)}ms
              </span>
            )}
          </div>
        </section>

        {/* Right column — opening framing, prediction, reveal caption, chat */}
        <section className="flex min-w-0 flex-col gap-3">
          <p className="text-text-primary font-text text-sm leading-snug">{framing}</p>

          <WorkshopPredict
            options={options}
            selectedOptionId={selectedOptionId}
            onSubmit={handlePredictSubmit}
          />

          {showReveal && chosen && <RevealCaption isCorrect={!!chosen.isCorrect} />}

          <WorkshopChat />
        </section>
      </div>
    </div>
  )
}

// -- Chrome --------------------------------------------------------------

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="border-border-soft flex items-center gap-3 border-b pb-3">
      <button
        type="button"
        onClick={onBack}
        className={cn(
          'text-text-tertiary hover:text-text-secondary inline-flex shrink-0 items-center gap-1.5',
          'text-xs transition-colors',
        )}
        aria-label="Back to map"
      >
        <ArrowLeft className="size-3.5" />
        Back to map
      </button>
      <span className="text-text-tertiary text-xs">·</span>
      <h2 className="text-text-primary truncate font-serif text-sm leading-tight">{title}</h2>
    </div>
  )
}

// -- Presets ------------------------------------------------------------

function PresetChips({
  active,
  onPick,
}: {
  active: PresetKey | null
  onPick: (key: PresetKey) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-text-tertiary mr-1 text-xs uppercase tracking-wide">Scenarios</span>
      {PRESET_ORDER.map((key) => {
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'border-accent/50 bg-accent/10 text-text-primary'
                : 'border-border-subtle text-text-secondary hover:bg-state-hover hover:border-accent/30',
            )}
          >
            {PRESETS[key].label}
          </button>
        )
      })}
    </div>
  )
}

// -- Predict (workshop-local copy of the chat-side primitive) -----------

function WorkshopPredict({
  options,
  selectedOptionId,
  onSubmit,
}: {
  options: PredictionOption[]
  selectedOptionId: string | null
  onSubmit: (id: string) => void
}) {
  const submitted = selectedOptionId !== null

  if (submitted) {
    const optionIndex = options.findIndex((o) => o.id === selectedOptionId)
    const selectedLabel = optionIndex >= 0 ? options[optionIndex].label : '(no answer)'
    return (
      <div className="border-border-soft rounded-lg border p-3 opacity-60">
        <div className="mb-2 text-text-secondary text-xs">Your prediction · submitted</div>
        <div className="border-border-subtle text-text-primary font-text flex items-start gap-3 rounded-md border bg-transparent px-3 py-2 text-left text-sm leading-snug">
          {optionIndex >= 0 && (
            <span
              className={cn(
                'bg-state-pill text-text-secondary inline-flex h-6 w-6 shrink-0',
                'items-center justify-center rounded-full text-xs font-medium',
              )}
            >
              {optionIndex + 1}
            </span>
          )}
          <span className="flex-1">{selectedLabel}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border-soft rounded-lg border p-3">
      <div className="mb-2 text-text-secondary text-xs">Your prediction</div>
      <div className="flex flex-col gap-2">
        {options.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSubmit(opt.id)}
            className={cn(
              'border-border-subtle hover:bg-state-hover hover:border-accent/40',
              'text-text-primary font-text rounded-md border bg-transparent',
              'flex items-start gap-3 px-3 py-2 text-left text-sm leading-snug',
              'cursor-pointer transition-colors',
            )}
          >
            <span
              className={cn(
                'bg-state-pill text-text-secondary inline-flex h-6 w-6 shrink-0',
                'items-center justify-center rounded-full text-xs font-medium',
              )}
            >
              {idx + 1}
            </span>
            <span className="flex-1">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// -- Reveal caption (now demoted — the real reveal is the viz) ---------

function RevealCaption({ isCorrect }: { isCorrect: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md border-l-2 px-3 py-2 text-xs leading-snug',
        isCorrect
          ? 'border-accent text-text-secondary bg-accent/5'
          : 'border-border-subtle text-text-tertiary',
      )}
    >
      {isCorrect
        ? "Watch the viz — the third never lands, so the aggregate stays pending. Try flipping fetch C to reject and play again."
        : "Watch the viz — the aggregate isn't doing what you predicted. Try flipping each track's outcome and replay to see why."}
    </div>
  )
}

// -- TimelineViz -------------------------------------------------------

function TimelineViz({
  tracks,
  currentTime,
  isPlaying,
  onUpdateTrack,
}: {
  tracks: TrackConfig[]
  currentTime: number
  isPlaying: boolean
  onUpdateTrack: (id: string, patch: Partial<TrackConfig>) => void
}) {
  const aggregate = deriveAggregate(tracks, currentTime)

  // The whole viz reads as:
  //
  //   Promise.all([            ← outer wrapper (darker tint, contains aggregate)
  //     fetch A,               ← inner container (lighter, inset, rounded)
  //     fetch B,
  //     fetch C,
  //   ])
  //
  // i.e. the structure mirrors the code: Promise.all "wraps" the fetches.
  // The aggregate row sits at the top (just like `Promise.all(` in source).
  return (
    <div className="border-border-soft bg-state-pill rounded-lg border p-3">
      <TimeAxisLabels />

      <AggregateRow aggregate={aggregate} currentTime={currentTime} isPlaying={isPlaying} />

      <div className="bg-page mt-3 flex flex-col gap-3 rounded-md p-3">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onUpdate={(patch) => onUpdateTrack(track.id, patch)}
          />
        ))}
      </div>
    </div>
  )
}

function TimeAxisLabels() {
  // Compact tick markers above the Promise.all row. Aligned to the same
  // 4-column grid the rows use so "0", "500ms", and "1s" sit under the rail
  // column at the matching positions (rail.left, rail.center, rail.right).
  return (
    <div className="text-text-tertiary mb-1.5 grid grid-cols-[60px_84px_1fr_56px] gap-3 text-[10px] tracking-normal">
      <span aria-hidden />
      <span aria-hidden />
      <div className="flex items-center justify-between">
        <span>0</span>
        <span>500ms</span>
        <span>1s</span>
      </div>
      <span aria-hidden />
    </div>
  )
}

function TrackRow({
  track,
  currentTime,
  isPlaying,
  onUpdate,
}: {
  track: TrackConfig
  currentTime: number
  isPlaying: boolean
  onUpdate: (patch: Partial<TrackConfig>) => void
}) {
  // The marker on the rail is ONE element that wears multiple hats:
  //   - Idle: it sits at the configured settle time (track.time). Drag it (via
  //     the underlying native range input) to reconfigure.
  //   - Playing: it animates from 0 toward its settle time, landing at
  //     track.time. For 'hang' it never lands — it travels with currentTime.
  //   - After settle: stays at track.time, styled by outcome (resolve dot,
  //     reject ✕, hang pulse).
  //
  // We layer a custom-rendered marker on top of a hidden native input. Native
  // input owns keyboard a11y and pointer drag; custom marker owns visuals.
  const markerTime =
    track.outcome === 'hang'
      ? Math.min(currentTime, MAX_TIME)
      : Math.min(currentTime, track.time)

  const hasSettled =
    track.outcome !== 'hang' && currentTime >= track.time && track.time <= MAX_TIME

  const railPctLeft = (markerTime / MAX_TIME) * 100
  const isDraggable = track.outcome !== 'hang' && !isPlaying

  return (
    <div className="grid grid-cols-[60px_84px_1fr_56px] items-center gap-3">
      <span className="text-text-secondary text-xs">{track.label}</span>

      <OutcomeSegmented value={track.outcome} onChange={(outcome) => onUpdate({ outcome })} />

      {/* The composite slider: rail + marker + invisible native input on top
          for keyboard + pointer interaction. */}
      <div className="relative h-4">
        {/* The rail itself, vertically centered in the 16px-tall hit area. */}
        <div className="bg-state-pill absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full" />

        {/* For hangs, a faint pending fill from 0 to the traveling marker —
            visual analog to "still going." */}
        {track.outcome === 'hang' && (
          <div
            aria-hidden
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-accent/20"
            style={{
              left: 0,
              width: `${Math.min(railPctLeft + 4, 100)}%`,
              transition: isPlaying ? 'none' : 'width 200ms ease-out',
            }}
          />
        )}

        {/* For resolved/reject at idle: a faint settled-fill from 0 to the
            marker, so the eye reads "time elapsed → settled here." */}
        {track.outcome !== 'hang' && hasSettled && (
          <div
            aria-hidden
            className={cn(
              'absolute top-1/2 h-2 -translate-y-1/2 rounded-full',
              track.outcome === 'resolve' && 'bg-accent/15',
              track.outcome === 'reject' && 'bg-danger/10',
            )}
            style={{
              left: 0,
              width: `${railPctLeft}%`,
              transition: isPlaying ? 'none' : 'width 200ms ease-out',
            }}
          />
        )}

        {/* The traveling marker — the one visual that represents this fetch. */}
        <TrackMarker
          outcome={track.outcome}
          leftPct={railPctLeft}
          hasSettled={hasSettled}
          isPlaying={isPlaying}
          isDraggable={isDraggable}
        />

        {/* Hidden native range input — accessible, keyboard-navigable, owns
            pointer drag. Sits on top of everything else but is visually
            transparent. Its thumb area is the full row height. */}
        <input
          type="range"
          min={50}
          max={950}
          step={10}
          value={track.time}
          onChange={(e) => onUpdate({ time: Number(e.target.value) })}
          disabled={!isDraggable}
          aria-label={`${track.label} settle time`}
          className={cn(
            'absolute inset-0 m-0 h-full w-full appearance-none bg-transparent',
            'focus-visible:outline-accent/50 focus-visible:outline-2 focus-visible:rounded-full',
            isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed',
            'opacity-0',
          )}
        />
      </div>

      <span
        className={cn(
          'text-right text-xs tabular-nums',
          track.outcome === 'hang' && 'text-accent-strong italic',
          track.outcome === 'resolve' && hasSettled && 'text-text-secondary',
          track.outcome === 'reject' && hasSettled && 'text-danger',
          !hasSettled && track.outcome !== 'hang' && 'text-text-tertiary',
        )}
      >
        {track.outcome === 'hang' ? '∞' : `${track.time}ms`}
      </span>
    </div>
  )
}

function TrackMarker({
  outcome,
  leftPct,
  hasSettled,
  isPlaying,
  isDraggable,
}: {
  outcome: Outcome
  leftPct: number
  hasSettled: boolean
  isPlaying: boolean
  isDraggable: boolean
}) {
  // Inline `left` (not a Tailwind class) so raf-driven animation can update
  // it per frame. Transition is off during play (raf updates every frame) and
  // on otherwise so dragging feels smooth.
  const style: React.CSSProperties = {
    left: `${leftPct}%`,
    transition: isPlaying ? 'none' : 'left 180ms ease-out',
  }

  // When the marker is draggable (idle + not a hang), give it a subtle ring
  // so it reads as a grabbable affordance rather than a static dot.
  const grabRing = isDraggable
    ? 'ring-1 ring-accent/30 ring-offset-1 ring-offset-page'
    : ''

  if (outcome === 'hang') {
    return (
      <span
        aria-hidden
        style={style}
        className={cn(
          'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
          'bg-accent animate-pulse',
          'shadow-[0_0_0_4px_rgba(217,119,87,0.18)]',
        )}
      />
    )
  }

  if (outcome === 'reject') {
    return (
      <span
        aria-hidden
        style={style}
        className={cn(
          'absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
          'flex items-center justify-center',
          hasSettled
            ? cn('size-4 rounded-full bg-danger/15', grabRing)
            : cn('bg-text-tertiary size-3 rounded-full', grabRing),
        )}
      >
        {hasSettled && <span className="text-danger text-[11px] leading-none">✕</span>}
      </span>
    )
  }

  // resolve
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
        hasSettled
          ? cn('bg-accent-strong size-3.5', grabRing)
          : cn('bg-text-tertiary size-3', grabRing),
      )}
    />
  )
}

function OutcomeSegmented({
  value,
  onChange,
}: {
  value: Outcome
  onChange: (next: Outcome) => void
}) {
  const items: { key: Outcome; label: string; aria: string }[] = [
    { key: 'resolve', label: 'R', aria: 'Resolves' },
    { key: 'reject', label: '✕', aria: 'Rejects' },
    { key: 'hang', label: '∞', aria: 'Hangs' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Outcome"
      className="border-border-subtle inline-flex shrink-0 overflow-hidden rounded-md border"
    >
      {items.map((item) => {
        const isActive = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={item.aria}
            onClick={() => onChange(item.key)}
            className={cn(
              'h-6 w-7 text-xs leading-none transition-colors',
              isActive
                ? item.key === 'reject'
                  ? 'bg-danger/10 text-danger'
                  : item.key === 'hang'
                    ? 'bg-accent/15 text-accent-strong'
                    : 'bg-accent/10 text-text-primary'
                : 'text-text-tertiary hover:bg-state-hover',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// -- Aggregate row -----------------------------------------------------

function AggregateRow({
  aggregate,
  currentTime,
  isPlaying,
}: {
  aggregate: Aggregate
  currentTime: number
  isPlaying: boolean
}) {
  // The aggregate's marker logic mirrors the track's: it shows where the
  // aggregate would settle (or that it's still pending). For 'pending', we
  // visually keep the rail empty with a subtle pulse — the user reads this
  // as "still waiting." The status text underneath narrates.
  let leftPct: number | null = null
  let kindLabel = ''
  if (aggregate.kind === 'resolved') {
    leftPct = currentTime >= aggregate.at ? (aggregate.at / MAX_TIME) * 100 : null
    kindLabel = `resolved at ${aggregate.at}ms`
  } else if (aggregate.kind === 'rejected') {
    leftPct = (aggregate.at / MAX_TIME) * 100
    kindLabel = `rejected at ${aggregate.at}ms (${aggregate.by})`
  } else {
    leftPct = null
    kindLabel =
      aggregate.cause === 'hang'
        ? `never settles — stuck on ${aggregate.hangTrack ?? 'a hang'}`
        : 'waiting…'
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[60px_84px_1fr_56px] items-center gap-3">
        <span className="text-text-primary font-mono text-[11px]">Promise.all</span>
        <span aria-hidden />
        <div className="relative h-4">
          <div className="bg-state-pill/60 absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full" />
          {/* Pending hangs get a slow traveling shimmer that doesn't reach
              the right edge — visual analog to the event loop still ticking
              but the aggregate never landing. */}
          {aggregate.kind === 'pending' && aggregate.cause === 'hang' && (
            <div
              aria-hidden
              className="absolute top-1/2 h-2 -translate-y-1/2 animate-pulse rounded-full bg-accent/20"
              style={{ left: 0, width: `${Math.min((currentTime / MAX_TIME) * 100, 95)}%` }}
            />
          )}
          {/* Settled-fill behind the aggregate marker for resolved/rejected,
              so the eye reads time-elapsed → outcome at this position. */}
          {aggregate.kind === 'resolved' && leftPct !== null && (
            <div
              aria-hidden
              className="bg-accent/20 absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
              style={{
                left: 0,
                width: `${leftPct}%`,
                transition: isPlaying ? 'none' : 'width 200ms ease-out',
              }}
            />
          )}
          {aggregate.kind === 'rejected' && leftPct !== null && (
            <div
              aria-hidden
              className="bg-danger/15 absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
              style={{
                left: 0,
                width: `${leftPct}%`,
                transition: isPlaying ? 'none' : 'width 200ms ease-out',
              }}
            />
          )}
          {leftPct !== null && (
            <span
              aria-hidden
              style={{
                left: `${leftPct}%`,
                transition: isPlaying ? 'none' : 'left 180ms ease-out',
              }}
              className={cn(
                'absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full',
                aggregate.kind === 'resolved' &&
                  'bg-accent-strong shadow-[0_0_0_4px_rgba(217,119,87,0.18)]',
                aggregate.kind === 'rejected' &&
                  'bg-danger/90 shadow-[0_0_0_4px_rgba(153,27,27,0.15)]',
              )}
            />
          )}
        </div>
        <span
          className={cn(
            'text-right text-xs tabular-nums',
            aggregate.kind === 'resolved' && 'text-accent-strong',
            aggregate.kind === 'rejected' && 'text-danger',
            aggregate.kind === 'pending' && 'text-text-tertiary italic',
          )}
        >
          {aggregate.kind === 'resolved' && `${aggregate.at}ms`}
          {aggregate.kind === 'rejected' && `${aggregate.at}ms`}
          {aggregate.kind === 'pending' && (aggregate.cause === 'hang' ? '∞' : '…')}
        </span>
      </div>
      <div
        className={cn(
          'pl-[156px] text-[11px] leading-tight',
          aggregate.kind === 'resolved' && 'text-text-secondary',
          aggregate.kind === 'rejected' && 'text-danger',
          aggregate.kind === 'pending' && 'text-text-tertiary',
        )}
      >
        {kindLabel}
      </div>
    </div>
  )
}
