"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
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
    defaultValues: { fullname: "" },
  })

  async function onSubmit(data: ContactFormData) {
    const result = await createContact({ fullname: data.fullname.trim() })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تمت إضافة جهة الاتصال")
    reset({ fullname: "" })
    onOpenChange(false)
    onMutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset({ fullname: "" })
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
            أدخل اسم جهة الاتصال. يمكن إضافة أرقام الهاتف وربط الشقق لاحقًا.
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
