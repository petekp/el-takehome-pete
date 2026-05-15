import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

type SparkIndicatorProps = ComponentProps<'div'> & {
  working?: boolean
}

export function SparkIndicator({ className, working = false, ...props }: SparkIndicatorProps) {
  return (
    <div className={cn('my-2 pl-2', className)} {...props}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative SVG/GIF status asset. */}
      <img
        src={working ? '/assets/spark-working.gif' : '/assets/spark-idle.svg'}
        alt=""
        className="block h-8 w-8"
      />
    </div>
  )
}
