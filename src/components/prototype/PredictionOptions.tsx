'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { usePrototypeStore } from '@/lib/prototype-store'
import { getConcept } from '@/lib/concepts'

/**
 * Renders the predict-beat surface inline inside an assistant message. The
 * server emits framing prose followed by <prediction-options/>; Streamdown
 * swaps it for this component.
 *
 * Layout (PRD §3.2):
 *   Header row — "Your prediction · 1 of 2" left, "End" button right.
 *   Three numbered option rows with a circular number badge.
 *   A single-row textarea for free-text answers ("Answer in your own words…").
 *
 * Visual states:
 *   beat === 'predicting'   → active surface (single-select buttons + textarea)
 *   prediction recorded     → inert pill showing the captured answer
 *   stale / no concept       → nothing
 */
export function PredictionOptions() {
  const { state, recordPrediction, endExchange } = usePrototypeStore()
  const { beat, conceptId, prediction, predictionOptions: live } = state.arc
  const [freeText, setFreeText] = useState('')

  if (!conceptId) return null

  // Beat 'exchange-ended' — predict surface is gone; keep the prior framing
  // message in chat but render nothing here. The choice pill on the affordance
  // message remains the visible record that the user opted in.
  if (beat === 'exchange-ended') return null

  // Live API content when available; concept registry as graceful-degrade path.
  const concept = getConcept(conceptId)
  const options = live?.options ?? concept.descriptors.fallback.predictionOptions.options

  if (beat === 'predicting') {
    const submitFreeText = () => {
      const trimmed = freeText.trim()
      if (trimmed.length === 0) return
      recordPrediction({ freeText: trimmed })
    }
    return (
      <div className="border-border-soft my-3 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-text-secondary text-sm">Your prediction · 1 of 2</span>
          <Button variant="ghost" size="sm" onClick={endExchange}>
            End
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => recordPrediction({ optionId: opt.id })}
              className={cn(
                'border-border-subtle hover:bg-state-hover hover:border-accent/40',
                'text-text-primary font-text rounded-md border bg-transparent',
                'flex items-start gap-3 px-3 py-3 text-left text-sm leading-snug',
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
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitFreeText()
              }
            }}
            rows={1}
            placeholder="Answer in your own words…"
            className={cn(
              'font-text text-text-primary placeholder:text-text-tertiary',
              'border-border-subtle focus:border-accent/40 rounded-md border bg-transparent',
              'resize-none px-3 py-3 text-sm leading-snug outline-none',
            )}
          />
        </div>
      </div>
    )
  }

  // Past 'predicting' — the prediction surface fades and labels itself
  // "Your prediction · submitted" per PRD §3.3, with the user's selected
  // option (or free-text) shown inside. The submitted card "sits at the top
  // of the structured surface" — i.e., it stays anchored to the predict
  // message while the reveal streams as the next message below.
  if (prediction) {
    const optionIndex = prediction.optionId
      ? options.findIndex((o) => o.id === prediction.optionId)
      : -1
    const selectedLabel =
      optionIndex >= 0 ? options[optionIndex].label : (prediction.freeText ?? '(no answer)')
    return (
      <div
        className={cn(
          'border-border-soft my-3 rounded-lg border p-3 opacity-60',
          'transition-opacity',
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-text-secondary text-sm">Your prediction · submitted</span>
        </div>
        <div
          className={cn(
            'border-border-subtle text-text-primary font-text bg-transparent',
            'flex items-start gap-3 rounded-md border px-3 py-3 text-left text-sm leading-snug',
          )}
        >
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

  return null
}
