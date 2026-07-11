"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Pencil, Phone, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toDisplayFormat } from "@/lib/phone"
import { phoneNumberSchema, type PhoneNumberFormData } from "@/lib/schemas"
import type { PhoneNumberRow } from "@/lib/server/reference-data"
import {
  addPhoneNumber,
  deletePhoneNumber,
  updatePhoneNumber,
} from "@/lib/server/reference-data"

export function PhoneNumbersTable({
  contactId,
  phoneNumbers,
  onMutate,
}: {
  contactId: number
  phoneNumbers: PhoneNumberRow[]
  onMutate: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PhoneNumberFormData>({
    resolver: zodResolver(phoneNumberSchema),
    defaultValues: { contactId, number: "" },
  })

  async function handleAddNumber(data: PhoneNumberFormData) {
    setBusy(true)
    const result = await addPhoneNumber({
      contactId: data.contactId,
      number: data.number.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    reset({ contactId, number: "" })
    onMutate()
  }

  async function handleUpdateNumber(id: number) {
    if (!editValue.trim()) return
    setBusy(true)
    const result = await updatePhoneNumber({ id, number: editValue.trim() })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setEditingId(null)
    setEditValue("")
    onMutate()
  }

  async function handleDeleteNumber(id: number) {
    setBusy(true)
    const result = await deletePhoneNumber({ id })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onMutate()
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Phone className="size-4 text-muted-foreground" />
        أرقام الهاتف
      </span>
      {phoneNumbers.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد أرقام.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {phoneNumbers.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              {editingId === p.id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    disabled={busy}
                    className="h-8 flex-1 font-mono"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleUpdateNumber(p.id)}
                    disabled={busy}
                  >
                    حفظ
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null)
                      setEditValue("")
                    }}
                    disabled={busy}
                  >
                    إلغاء
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-mono text-sm">
                    {toDisplayFormat(p.number)}
                  </span>
                  <div className="ms-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(p.id)
                        setEditValue(toDisplayFormat(p.number))
                      }}
                      disabled={busy}
                    >
                      <Pencil className="size-3.5" />
                      تعديل
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleDeleteNumber(p.id)}
                      disabled={busy}
                      className="hover:bg-destructive/10 hover:text-destructive"
                      aria-label="حذف الرقم"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={handleSubmit(handleAddNumber)}
      >
        <Input
          placeholder="مثال: 771811986"
          {...register("number")}
          disabled={busy || isSubmitting}
          className="min-w-40 flex-1 font-mono"
        />
        <Button type="submit" disabled={busy || isSubmitting}>
          <Plus className="size-4" />
          إضافة
        </Button>
      </form>
      {errors.number && (
        <p className="text-sm text-destructive">
          {typeof errors.number.message === "string"
            ? errors.number.message
            : "رقم غير صالح"}
        </p>
      )}
    </div>
  )
}
