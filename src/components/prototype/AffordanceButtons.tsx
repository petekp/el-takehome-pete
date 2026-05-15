'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { usePrototypeStore } from '@/lib/prototype-store'
import { getConcept } from '@/lib/concepts'
import { Search } from 'lucide-react'

/**
 * Renders the two-button affordance inline inside an assistant message.
 * Triggered by Streamdown when it encounters the <affordance/> custom tag.
 *
 * Visual states:
 *   beat === 'choosing'           → active two-button row
 *   beat past 'choosing'          → inert pill recording the choice
 *   no active arc / different chat→ nothing (defensive: stale message
 *                                    from a different arc instance)
 */
export function AffordanceButtons() {
  const { state, chooseWrapper, chooseLearn } = usePrototypeStore()
  const { beat, conceptId, path } = state.arc

  if (!conceptId) return null

  const concept = getConcept(conceptId)
  const labels = concept.descriptors.fallback.affordance.cta

  if (beat === 'choosing') {
    return (
      <div className="my-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={chooseWrapper}>
          {labels.wrapper}
        </Button>
        <Button
          variant="outline"
          onClick={chooseLearn}
          className="border-accent text-accent-strong hover:bg-accent/10"
        >
          <Search className="size-4" aria-hidden="true" />
          {labels.learn}
        </Button>
      </div>
    )
  }

  // Past 'choosing' — show the inert pill recording the user's choice. The
  // pill grounds the rest of the thread for anyone scrolling back up.
  if (path) {
    return <ChoicePill label={path === 'wrapper' ? labels.wrapper : labels.learn} />
  }

  return null
}

function ChoicePill({ label }: { label: string }) {
  return (
    <div className="my-3 inline-flex">
      <span
        className={cn(
          'bg-state-pill text-text-secondary inline-flex items-center gap-1.5',
          'rounded-sm px-2.5 py-1 text-xs',
        )}
      >
        <span className="text-text-tertiary">Chose:</span>
        <span>{label}</span>
      </span>
    </div>
  )
}
