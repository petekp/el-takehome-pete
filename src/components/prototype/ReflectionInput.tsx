'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { usePrototypeStore } from '@/lib/prototype-store'

/**
 * Renders the reflection-beat input inline inside an assistant message.
 * Server emits the framing prose + <reflection-input/>; Streamdown swaps in
 * this component.
 *
 * Layout (PRD §3.3):
 *   Header row — "Your take" label left, "End" button right.
 *   Textarea sized for 1–3 sentences, placeholder "In your own words…".
 *   Skip + Add to notes buttons below.
 *
 * Visual states:
 *   beat === 'reflecting'        → active surface
 *   reflection recorded          → inert "Kept" pill (or "Skipped reflection")
 *   exchange-ended               → nothing
 *   stale                        → nothing
 */
export function ReflectionInput() {
  const { state, recordReflection, endExchange } = usePrototypeStore()
  const { beat, reflection } = state.arc
  const [value, setValue] = useState('')

  if (beat === 'exchange-ended') return null

  if (beat === 'reflecting') {
    return (
      <div className="border-border-soft my-3 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-text-secondary text-sm">Your take</span>
          <Button variant="ghost" size="sm" onClick={endExchange}>
            End
          </Button>
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          placeholder="In your own words…"
          className={cn(
            'font-text text-text-primary placeholder:text-text-tertiary',
            'min-h-[72px] w-full resize-none border-none bg-transparent text-sm leading-snug outline-none',
          )}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => recordReflection({ text: '' })}>
            Skip
          </Button>
          <Button
            variant="primary"
            onClick={() => recordReflection({ text: value.trim() })}
            disabled={value.trim().length === 0}
          >
            Add to notes
          </Button>
        </div>
      </div>
    )
  }

  if (reflection) {
    const text = reflection.text
    return (
      <div className="my-3 inline-flex max-w-full">
        <span
          className={cn(
            'bg-state-pill text-text-secondary inline-flex items-start gap-1.5',
            'rounded-sm px-2.5 py-1.5 text-xs leading-snug',
          )}
        >
          <span className="text-text-tertiary shrink-0">
            {text.length > 0 ? 'Kept:' : 'Skipped reflection'}
          </span>
          {text.length > 0 && <span className="line-clamp-3">{text}</span>}
        </span>
      </div>
    )
  }

  return null
}
