'use client'

import { ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

/**
 * Bottom-of-viewport control row for the artifact's 3D scene. A unified
 * pane container that holds one or more `ControlChip`s. Each chip surfaces
 * a label + current active value, and reveals its actual control affordance
 * (toggle, slider, etc.) in a popover above.
 *
 * The pane owns "which chip is currently open" so opening one chip
 * automatically closes any sibling chip's popover. Without this, hovering
 * between chips could leave both popovers stacked on the canvas.
 */
type OpenChipContext = {
  openId: string | null
  setOpenId: (id: string | null) => void
}

const OpenChipCtx = createContext<OpenChipContext | null>(null)

export function ControlPane({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <OpenChipCtx.Provider value={{ openId, setOpenId }}>
      <div
        className={cn(
          'pointer-events-auto inline-flex items-center gap-0.5',
          'border-border-subtle bg-surface/95 rounded-full border px-1 py-1 backdrop-blur-md',
          className,
        )}
      >
        {children}
      </div>
    </OpenChipCtx.Provider>
  )
}

/**
 * Click/tap is the only open action. Outside-click and Escape close. A
 * hover-open variant lived here before but it fought with click: hovering
 * opened the popover, then the chip click read as a toggle and closed it
 * immediately. Hover-as-preview is gone — click is the entire interaction.
 */
export function ControlChip({
  label,
  value,
  children,
  popoverClassName,
  className,
}: {
  label: string
  value: ReactNode
  children: ReactNode
  popoverClassName?: string
  className?: string
}) {
  const ctx = useContext(OpenChipCtx)
  const chipId = useId()
  const open = ctx?.openId === chipId
  const setOpen = (next: boolean) => ctx?.setOpenId(next ? chipId : null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const node = wrapperRef.current
      if (!node) return
      if (node.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${label} control`}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]',
          'text-text-secondary',
          'hover:bg-state-hover',
          open && 'bg-state-hover',
        )}
      >
        <span className="text-text-tertiary whitespace-nowrap">{label}</span>
        <span className="font-medium tabular-nums whitespace-nowrap">{value}</span>
        <ChevronUp
          aria-hidden
          className={cn(
            'text-text-tertiary size-3 opacity-60 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            // Anchoring to the chip's left edge (not center) lets popovers
            // wider than the chip grow rightward without clipping against
            // the viewport edge. No exit animation: when the active chip
            // switches, the previous popover unmounts instantly so the two
            // never visually overlap.
            className={cn('absolute bottom-full left-0 z-20 pb-2')}
          >
            <div
              className={cn(
                'border-border-subtle bg-surface/95 rounded-full border px-2 py-1 backdrop-blur-md',
                'shadow-popover flex items-center',
                popoverClassName,
              )}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
