"use client"

import { Search, X } from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function useSearchFilter<T>(
  items: T[],
  matcher: (item: T, query: string) => boolean
) {
  const [query, setQuery] = useState("")
  const deferred = useDeferredValue(query)
  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    if (q === "") return items
    return items.filter((item) => matcher(item, q))
  }, [items, deferred, matcher])
  return { query, setQuery, filtered }
}

export function SearchInput({
  value,
  onChange,
  placeholder = "بحث...",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute inset-y-0 inset-s-3 my-auto size-4 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ps-9 pe-9"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute inset-y-0 inset-e-2 my-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="مسح البحث"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
