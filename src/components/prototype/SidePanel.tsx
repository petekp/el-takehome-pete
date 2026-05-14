'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { usePrototypeStore, type SidePanelView } from '@/lib/prototype-store'
import { getConcept, type ConceptId } from '@/lib/concepts'
import { MapView } from './MapView'
import { WorkshopView } from './WorkshopView'

/**
 * Per-chat side panel slot. Mounted as a sibling to the chat column inside
 * the chat page (not in the global shell) so that opening/closing only
 * affects this conversation.
 *
 * Width is view-aware: map = 480px (compact, the map only needs that much),
 * workshop = 720px (PRD §4 specifies a two-column viz+chat layout — that
 * needs the real estate). Width transitions through both opening and view
 * changes via the same 250ms ease-out so flipping map ↔ workshop reads as one
 * fluid widening.
 */
const PANEL_WIDTH: Record<SidePanelView, number> = {
  map: 480,
  workshop: 800,
}

export function SidePanel() {
  const { state, closeSidePanel } = usePrototypeStore()
  const { open, view } = state.sidePanel
  const conceptId = state.arc.conceptId
  const widthPx = PANEL_WIDTH[view]

  return (
    <aside
      // role="complementary" semantically labels the panel as supplemental
      // to the chat. aria-hidden flips when closed so screen readers ignore it.
      role="complementary"
      aria-label="Concept map and workshop"
      aria-hidden={!open}
      style={{ width: open ? widthPx : 0 }}
      className={cn(
        'border-border-soft bg-surface h-full shrink-0 overflow-hidden border-l',
        'transition-[width] duration-[250ms] ease-out',
      )}
    >
      <div
        className={cn(
          'flex h-full flex-col',
          'transition-[width] duration-[250ms] ease-out',
        )}
        style={{ width: widthPx }}
      >
        <PanelHeader view={view} conceptId={conceptId} onClose={closeSidePanel} />
        <div className="scroll-area flex-1 overflow-auto px-6 py-5">
          <PanelBody view={view} conceptId={conceptId} />
        </div>
      </div>
    </aside>
  )
}

function PanelHeader({
  view,
  conceptId,
  onClose,
}: {
  view: SidePanelView
  conceptId: ConceptId | null
  onClose: () => void
}) {
  return (
    <div className="border-border-soft flex items-start justify-between gap-4 border-b px-6 py-4">
      <div className="min-w-0">
        {view === 'workshop' ? (
          <>
            <div className="text-text-tertiary text-xs uppercase tracking-wide">Workshop</div>
            <h2 className="text-text-primary truncate text-base font-medium">
              {conceptId ? getConcept(conceptId).descriptors.title : 'Workshop'}
            </h2>
          </>
        ) : (
          <>
            <h2 className="text-text-primary font-serif text-base leading-tight">Your map</h2>
            <p className="text-text-tertiary mt-1 text-xs leading-snug">
              Concepts you&rsquo;ve explored with Claude collect here.
            </p>
          </>
        )}
      </div>
      <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close panel">
        <X className="size-4" />
      </Button>
    </div>
  )
}

function PanelBody({ view, conceptId }: { view: SidePanelView; conceptId: ConceptId | null }) {
  if (!conceptId) {
    return (
      <div className="text-text-tertiary flex h-full items-center justify-center text-center text-sm">
        No concept open.
      </div>
    )
  }
  return view === 'workshop' ? <WorkshopView /> : <MapView />
}
