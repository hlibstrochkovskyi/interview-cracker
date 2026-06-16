import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface-elevated p-5 shadow-elevated',
        className
      )}
      {...props}
    />
  )
}
