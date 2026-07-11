"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { PhoneNumbersEditor } from "@/components/phone-numbers-editor"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { contactLinkSchema, type ContactLinkFormData } from "@/lib/schemas"
import type { ContactRow } from "@/lib/server/reference-data"
import {
  addPhoneNumber,
  createContact,
  linkContact,
} from "@/lib/server/reference-data"
import type { ContactRole } from "@/lib/server/schema"

export type { ContactRow }

export function AddContactDialog({
  apartmentId,
  available,
  open,
  onOpenChange,
  onMutate,
  trigger,
}: {
  apartmentId: number
  available: ContactRow[]
  open: boolean
  onOpenChange: (v: boolean) => void
  onMutate: () => void
  trigger?: React.ReactNode
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactLinkFormData>({
    resolver: zodResolver(contactLinkSchema),
    defaultValues: {
      apartmentId,
      contactId: undefined,
      newName: "",
      role: "owner",
      isNotificationRecipient: true,
    },
  })
  const [phones, setPhones] = useState<string[]>([""])
  const contactId = watch("contactId")
  const newName = watch("newName")
  const role = watch("role")
  const notify = watch("isNotificationRecipient")

  function resetForm() {
    reset({
      apartmentId,
      contactId: undefined,
      newName: "",
      role: "owner",
      isNotificationRecipient: true,
    })
    setPhones([""])
  }

  async function onSubmit(data: ContactLinkFormData) {
    let cid = data.contactId
    if (data.newName && data.newName.trim().length > 0) {
      const created = await createContact({ fullname: data.newName.trim() })
      if (!created.ok) {
        toast.error(created.error)
        return
      }
      cid = created.data.id
    }
    if (cid === undefined || Number.isNaN(cid)) {
      toast.error("اختر جهة اتصال أو أنشئ جديدة")
      return
    }
    const result = await linkContact({
      apartmentId,
      contactId: cid,
      role: data.role,
      isNotificationRecipient: data.isNotificationRecipient,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const cleanPhones = phones.map((p) => p.trim()).filter((p) => p.length > 0)
    for (const number of cleanPhones) {
      const r = await addPhoneNumber({ contactId: cid, number })
      if (!r.ok) toast.error(r.error)
    }
    toast.success("تمت إضافة جهة الاتصال")
    resetForm()
    onOpenChange(false)
    onMutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ?? (
        <DialogTrigger
          render={
            <Button size="sm">
              <Plus className="size-4" />
              إضافة جهة اتصال
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة جهة اتصال</DialogTitle>
          <DialogDescription>
            اختر جهة موجودة أو أنشئ اسمًا جديدًا، ثم حدّد الدور والإشعار وأرقام
            الهاتف.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="existing">جهة اتصال موجودة</Label>
            <NativeSelect
              id="existing"
              className="w-full"
              value={contactId !== undefined ? String(contactId) : ""}
              onChange={(e) =>
                setValue(
                  "contactId",
                  e.target.value && e.target.value !== ""
                    ? Number(e.target.value)
                    : undefined
                )
              }
              disabled={isSubmitting}
            >
              <NativeSelectOption value="" disabled>
                اختر...
              </NativeSelectOption>
              {available.length === 0 ? (
                <NativeSelectOption value="__none" disabled>
                  لا توجد متاحة
                </NativeSelectOption>
              ) : (
                available.map((c) => (
                  <NativeSelectOption key={c.id} value={String(c.id)}>
                    {c.fullname}
                  </NativeSelectOption>
                ))
              )}
            </NativeSelect>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">أو</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="newName">اسم جديد</Label>
            <Input
              id="newName"
              placeholder="اكتب الاسم لإنشاء جهة جديدة"
              {...register("newName")}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">الدور</Label>
              <NativeSelect
                id="role"
                className="w-full"
                value={role}
                onChange={(e) =>
                  e.target.value &&
                  setValue("role", e.target.value as ContactRole)
                }
                disabled={isSubmitting}
              >
                <NativeSelectOption value="owner">مالك</NativeSelectOption>
                <NativeSelectOption value="tenant">مستأجر</NativeSelectOption>
                <NativeSelectOption value="manager">مدير</NativeSelectOption>
              </NativeSelect>
            </div>
            <label
              htmlFor="notify"
              className="flex cursor-pointer items-center gap-2 pt-7"
            >
              <Checkbox
                id="notify"
                checked={notify}
                onCheckedChange={(v) =>
                  setValue("isNotificationRecipient", v === true)
                }
                disabled={isSubmitting}
              />
              <span className="text-sm">مستلم إشعارات</span>
            </label>
          </div>

          <PhoneNumbersEditor
            phones={phones}
            onChange={setPhones}
            disabled={isSubmitting}
          />

          {(errors.contactId || errors.newName || errors.role) && (
            <p className="text-sm text-destructive">
              {errors.contactId?.message ||
                errors.newName?.message ||
                errors.role?.message}
            </p>
          )}
          {newName === "" && contactId === undefined && (
            <p className="text-sm text-muted-foreground">
              اختر جهة اتصال أو أنشئ جديدة
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ..." : "إضافة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
