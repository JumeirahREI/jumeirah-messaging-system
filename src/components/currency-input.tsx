"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn, formatCurrency, MAX_INVOICE_TOTAL } from "@/lib/utils"

export function CurrencyInput({
  value,
  onCommit,
  disabled,
  className,
  ariaLabel,
}: {
  value: number
  onCommit: (next: number) => void
  disabled?: boolean
  className?: string
  ariaLabel: string
}) {
  const [draft, setDraft] = React.useState<string>(() => round(value))
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) setDraft(round(value))
  }, [value, focused])

  function clamp(raw: number): number {
    if (!Number.isFinite(raw)) return 0
    if (raw < 0) return 0
    if (raw > MAX_INVOICE_TOTAL) return MAX_INVOICE_TOTAL
    return Math.round(raw * 100) / 100
  }

  return focused ? (
    <Input
      type="number"
      min={0}
      max={MAX_INVOICE_TOTAL}
      step="0.01"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false)
        const next = clamp(Number(draft))
        setDraft(round(next))
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setDraft(round(value))
          setFocused(false)
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      disabled={disabled}
      className={cn("w-32 tabular-nums", className)}
      aria-label={ariaLabel}
      autoFocus
    />
  ) : (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setFocused(true)}
      className={cn(
        "h-9 w-32 rounded-md border border-input bg-transparent px-2.5 py-1 text-start tabular-nums text-base shadow-xs outline-none transition-[color,box-shadow] hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      aria-label={ariaLabel}
    >
      {formatCurrency(Number(draft) || 0)}
    </button>
  )
}

function round(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return (Math.round(n * 100) / 100).toString()
}
