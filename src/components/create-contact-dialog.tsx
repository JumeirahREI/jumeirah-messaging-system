"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Phone, Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { contactSchema, type ContactFormData } from "@/lib/schemas"
import { createContact } from "@/lib/server/reference-data"

export function CreateContactDialog({
  open,
  onOpenChange,
  onMutate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onMutate: () => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { fullname: "", phone: "" },
  })

  async function onSubmit(data: ContactFormData) {
    const result = await createContact({
      fullname: data.fullname.trim(),
      phone: data.phone?.trim() || undefined,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تمت إضافة جهة الاتصال")
    reset({ fullname: "", phone: "" })
    onOpenChange(false)
    onMutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset({ fullname: "", phone: "" })
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            جهة اتصال جديدة
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>جهة اتصال جديدة</DialogTitle>
          <DialogDescription>
            أدخل اسم جهة الاتصال ورقم الهاتف (اختياري). يمكن إضافة المزيد من
            الأرقام وربط الشقق لاحقًا.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullname">الاسم</Label>
            <Input
              id="fullname"
              placeholder="الاسم الكامل"
              {...register("fullname")}
              disabled={isSubmitting}
              autoFocus
            />
            {errors.fullname && (
              <p className="text-sm text-destructive">
                {errors.fullname.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">رقم الهاتف (اختياري)</Label>
            <div className="relative">
              <Phone className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                placeholder="7XXXXXXXX"
                className="pr-9"
                dir="ltr"
                {...register("phone")}
                disabled={isSubmitting}
              />
            </div>
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>
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
