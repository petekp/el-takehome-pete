'use client'

import { ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bottom-of-viewport control row for the artifact's 3D scene. A unified
 * pane container that holds one or more `ControlChip`s. Each chip surfaces
 * a label + current active value, and reveals its actual control affordance
 * (toggle, slider, etc.) in a popover above on hover.
 */
export function ControlPane({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto inline-flex items-center gap-0.5',
        'border-border-subtle bg-page/97 rounded-full border px-1 py-1 backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  )
}

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
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn('relative', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${label} control`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]',
          'text-text-secondary transition-colors',
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
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            // pb-2 keeps the popover within the chip's hover tracking so
            // moving the cursor up doesn't dismiss the popover before
            // reaching its content. Anchoring to the chip's left edge (not
            // center) lets popovers wider than the chip grow rightward
            // without clipping against the viewport edge.
            className={cn('absolute bottom-full left-0 z-20 pb-2')}
          >
            <div
              className={cn(
                'border-border-subtle bg-page/97 rounded-full border px-2 py-1 backdrop-blur-md',
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
