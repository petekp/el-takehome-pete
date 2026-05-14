'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrototypeStore } from '@/lib/prototype-store'

/**
 * Sidebar entry that points at the artifact in the current chat thread. When
 * the user has engaged the artifact path, this surfaces in the global sidebar
 * as a small "Explainer" link. Clicking it scrolls the inline artifact into
 * view — it persists in the chat, never re-opens as a separate surface.
 */
export function ArtifactPanel() {
  const { state } = usePrototypeStore()
  const arc = state.arc
  const id = arc.artifactMessageId
  if (!id) return null
  if (arc.beat === 'idle' || arc.beat === 'choosing' || arc.beat === 'wrapper-response') {
    return null
  }

  const scrollTo = () => {
    const el = document.getElementById(`message-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <button
      type="button"
      onClick={scrollTo}
      className={cn(
        'group hover:bg-state-hover-soft mx-2 my-1 flex items-center gap-2 rounded-md',
        'px-2 py-1.5 text-left transition-colors',
      )}
    >
      <Sparkles className="text-accent-strong size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-text-secondary group-hover:text-text-primary truncate text-xs">
          Molecular geometry
        </div>
        <div className="text-text-tertiary truncate text-[10px]">Explainer</div>
      </div>
    </button>
  )
}
