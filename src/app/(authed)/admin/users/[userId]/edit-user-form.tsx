"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { userUpdateSchema, type UserUpdateFormData } from "@/lib/schemas"
import {
  resetUserPassword,
  softDeleteUser,
  updateUser,
} from "@/lib/server/reference-data"

export function EditUserForm({
  userId,
  initialFullname,
  initialUsername,
  initialIsAdmin,
}: {
  userId: number
  initialFullname: string
  initialUsername: string
  initialIsAdmin: boolean
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserUpdateFormData>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      id: userId,
      fullname: initialFullname,
      username: initialUsername,
      isAdmin: initialIsAdmin,
    },
  })
  const isAdmin = watch("isAdmin")

  const [isResetting, setIsResetting] = useState(false)

  async function onUpdate(data: UserUpdateFormData) {
    const result = await updateUser({
      id: userId,
      fullname: data.fullname,
      username: data.username,
      isAdmin: data.isAdmin,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث المستخدم")
    router.refresh()
  }

  async function handleResetPassword() {
    setIsResetting(true)
    const result = await resetUserPassword({ id: userId })
    setIsResetting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إعادة تعيين كلمة المرور")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteUser({ id: userId })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف المستخدم")
    router.push("/admin/users")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <form onSubmit={handleSubmit(onUpdate)}>
          <Card>
            <CardHeader>
              <CardTitle>تعديل المستخدم</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullname">الاسم الكامل</Label>
                <Input
                  id="fullname"
                  {...register("fullname")}
                  disabled={isSubmitting}
                />
                {errors.fullname && (
                  <p className="text-sm text-destructive">
                    {errors.fullname.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">اسم المستخدم</Label>
                <Input
                  id="username"
                  {...register("username")}
                  disabled={isSubmitting}
                />
                {errors.username && (
                  <p className="text-sm text-destructive">
                    {errors.username.message}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isAdmin"
                  checked={isAdmin}
                  onCheckedChange={(v) => setValue("isAdmin", v === true)}
                  disabled={isSubmitting}
                />
                <Label htmlFor="isAdmin">صلاحيات مسؤول</Label>
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
                      disabled={deleting}
                      className="hover:bg-destructive/10 hover:text-destructive"
                      aria-label="حذف"
                    >
                      <Trash2 />
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف المستخدم؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      لن يتمكن المستخدم من تسجيل الدخول بعد الحذف. لا يمكن
                      التراجع.
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
          </Card>
        </form>
      </div>

      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>إعادة تعيين كلمة المرور</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              سيتم تعيين كلمة المرور إلى اسم المستخدم وسيتعين على المستخدم
              تغييرها عند تسجيل الدخول.
            </p>
          </CardContent>
          <CardFooter>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" disabled={isResetting}>
                    إعادة تعيين كلمة المرور
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد إعادة التعيين؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم تعيين كلمة المرور إلى اسم المستخدم وسيتعين على المستخدم
                    تغييرها عند تسجيل الدخول.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetPassword}>
                    تأكيد
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
