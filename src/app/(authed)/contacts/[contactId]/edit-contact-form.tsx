"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { ContactLinksTable } from "@/components/contact-links-table"
import { PhoneNumbersTable } from "@/components/phone-numbers-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { contactSchema, type ContactFormData } from "@/lib/schemas"
import type {
  ContactApartmentLinkRow,
  PhoneNumberRow,
  ProjectRow,
} from "@/lib/server/reference-data"
import {
  softDeleteContact,
  updateContact,
} from "@/lib/server/reference-data"

export function EditContactForm({
  contactId,
  initialFullname,
  phoneNumbers,
  links,
  projects,
}: {
  contactId: number
  initialFullname: string
  phoneNumbers: PhoneNumberRow[]
  links: ContactApartmentLinkRow[]
  projects: ProjectRow[]
}) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { fullname: initialFullname },
  })

  async function refresh() {
    router.refresh()
  }

  async function onSubmit(data: ContactFormData) {
    const result = await updateContact({
      id: contactId,
      fullname: data.fullname.trim(),
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث جهة الاتصال")
  }

  async function handleDelete() {
    const result = await softDeleteContact({ id: contactId })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف جهة الاتصال")
    router.push("/contacts")
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>تعديل جهة الاتصال</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullname">الاسم</Label>
              <Input
                id="fullname"
                placeholder="الاسم الكامل"
                {...register("fullname")}
                disabled={isSubmitting}
              />
              {errors.fullname && (
                <p className="text-sm text-destructive">
                  {errors.fullname.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="hover:bg-destructive/10 hover:text-destructive"
                    aria-label="حذف"
                  >
                    <Trash2 />
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف جهة الاتصال؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف جهة الاتصال وجميع أرقام الهاتف وروابط الشقق
                    المرتبطة بها. لا يمكن التراجع.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    حذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أرقام الهاتف</CardTitle>
        </CardHeader>
        <CardContent>
          <PhoneNumbersTable
            contactId={contactId}
            phoneNumbers={phoneNumbers}
            onMutate={refresh}
          />
        </CardContent>
      </Card>

      <ContactLinksTable
        contactId={contactId}
        links={links}
        projects={projects}
        onMutate={refresh}
      />
    </div>
  )
}
