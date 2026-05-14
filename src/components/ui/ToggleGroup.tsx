'use client'

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A minimal single-select toggle group, modeled after shadcn/ui's
 * ToggleGroup API (`type="single"`, `value`, `onValueChange`) but built
 * from plain Tailwind without Radix — matches this project's existing UI
 * primitive convention (see `Button`). Items connect visually: outer
 * corners are rounded, neighboring borders collapse into a single edge.
 */

type ToggleGroupContextValue = {
  value: string | null
  onValueChange: (value: string) => void
}
const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null)

type ToggleGroupProps = ComponentProps<'div'> & {
  type: 'single'
  value: string | null
  onValueChange: (value: string) => void
  children: ReactNode
}

export function ToggleGroup({
  className,
  value,
  onValueChange,
  children,
  ...rest
}: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div
        role="group"
        className={cn(
          'inline-flex items-center isolate',
          // Children collapse adjacent borders; using a negative margin on
          // non-first children avoids a double-thick seam between items.
          '[&>*:not(:first-child)]:-ml-px',
          '[&>*:first-child]:rounded-l-full',
          '[&>*:last-child]:rounded-r-full',
          '[&>*:not(:first-child):not(:last-child)]:rounded-none',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  )
}

type ToggleGroupItemProps = ComponentProps<'button'> & {
  value: string
}

export function ToggleGroupItem({
  className,
  value,
  children,
  ...rest
}: ToggleGroupItemProps) {
  const ctx = useContext(ToggleGroupContext)
  if (!ctx) throw new Error('ToggleGroupItem must be used inside a ToggleGroup')
  const active = ctx.value === value
  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      aria-pressed={active}
      data-state={active ? 'on' : 'off'}
      className={cn(
        'group relative inline-flex shrink-0 items-center justify-center px-3.5 py-1.5',
        'border text-[12px] font-medium whitespace-nowrap transition-colors backdrop-blur-md',
        active
          ? 'border-accent/55 bg-accent/15 text-accent-strong z-10'
          : 'border-border-subtle bg-surface/80 text-text-secondary hover:border-border-soft hover:bg-surface/95',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
