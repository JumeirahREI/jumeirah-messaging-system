"use client"
import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PhoneNumbersEditor({
  phones,
  onChange,
  disabled,
}: {
  phones: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>أرقام الهاتف (اختياري)</Label>
      <div className="flex flex-col gap-2">
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={p}
              onChange={(e) =>
                onChange(phones.map((x, j) => (j === i ? e.target.value : x)))
              }
              placeholder="مثال: 771811986"
              disabled={disabled}
              className="flex-1 font-mono"
            />
            {phones.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(phones.filter((_, j) => j !== i))}
                disabled={disabled}
                className="text-destructive hover:text-destructive"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...phones, ""])}
        disabled={disabled}
        className="w-fit"
      >
        <Plus className="size-4" />
        رقم آخر
      </Button>
    </div>
  )
}
