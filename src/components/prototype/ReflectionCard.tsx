'use client'

import { cn } from '@/lib/utils'
import { ArrowUpRight } from 'lucide-react'
import { usePrototypeStore } from '@/lib/prototype-store'
import { getConcept } from '@/lib/concepts'

/**
 * The inline notecard rendered inside an assistant message via Streamdown
 * at the closing beat of the structured exchange. Clicking Open transitions
 * the arc into the map view (side panel slides in).
 *
 * Layout (PRD §3.4):
 *   [ lit-asterisk icon ] [ serif concept title ]                        [ Open ↗ ]
 *                         "concept from this conversation"
 *
 * Width is constrained (~460px) and the surface should feel like a notecard,
 * not an interface element.
 *
 * Visual states:
 *   beat === 'card-ready'                       → Open is the active affordance
 *   beat in {'map-open', 'workshop-open'}       → inert "Opened" state
 *   else                                        → nothing (stale)
 */
export function ReflectionCard() {
  const { state, openCard } = usePrototypeStore()
  const { beat, conceptId, cardMeta } = state.arc

  if (!conceptId) return null
  const concept = getConcept(conceptId)
  const conceptTitle = cardMeta?.conceptTitle ?? concept.descriptors.title

  const cardActive = beat === 'card-ready'
  const cardOpened = beat === 'map-open' || beat === 'workshop-open'

  if (!cardActive && !cardOpened) return null

  return (
    <button
      type="button"
      onClick={openCard}
      disabled={cardOpened}
      aria-label={cardOpened ? 'Card opened' : 'Open card in map'}
      className={cn(
        'group my-3 block w-full max-w-[460px] text-left',
        'border-border-soft bg-surface rounded-lg border',
        'shadow-input transition-colors',
        cardActive && 'hover:border-accent/40 cursor-pointer',
        cardOpened && 'opacity-70',
      )}
    >
      <div className="grid grid-cols-[28px_1fr_auto] items-start gap-3 p-4">
        {/* Lit-asterisk icon — the feature's identity mark. */}
        <img
          src="/assets/spark-idle.svg"
          alt=""
          className="mt-0.5 block h-6 w-6"
          aria-hidden
        />

        {/* Title block: serif title + secondary line. */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              'font-serif text-text-primary text-[17px] font-normal leading-snug',
              'truncate',
            )}
          >
            {conceptTitle}
          </span>
          <span className="text-text-tertiary text-xs leading-snug">
            concept from this conversation
          </span>
        </div>

        {/* Open affordance. */}
        <span
          className={cn(
            'text-text-secondary group-hover:text-accent-strong inline-flex items-center gap-1',
            'shrink-0 text-xs',
          )}
        >
          {cardOpened ? 'Opened' : 'Open'}
          {!cardOpened && <ArrowUpRight className="size-3.5" />}
        </span>
      </div>
    </button>
  )
}
