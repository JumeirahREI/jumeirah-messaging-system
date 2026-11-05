"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

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
import { userCreateSchema, type UserCreateFormData } from "@/lib/schemas"
import { createUser } from "@/lib/server/reference/users"
import { TemporaryPasswordDialog } from "../temporary-password-dialog"

export default function NewUserPage() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserCreateFormData>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      fullname: "",
      username: "",
      isAdmin: false,
    },
  })
  const isAdmin = watch("isAdmin")
  const [created, setCreated] = useState<{
    id: number
    username: string
    temporaryPassword: string
  } | null>(null)

  async function onSubmit(data: UserCreateFormData) {
    const result = await createUser({
      fullname: data.fullname,
      username: data.username,
      isAdmin: data.isAdmin,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إنشاء المستخدم")
    setCreated(result.data)
  }

  return (
    <div className="mx-auto max-w-md">
      <TemporaryPasswordDialog
        username={created?.username ?? ""}
        temporaryPassword={created?.temporaryPassword ?? null}
        onClose={() => router.push(`/admin/users/${created?.id}`)}
      />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>مستخدم جديد</CardTitle>
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
          <CardFooter className="gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => router.push("/admin/users")}
            >
              إلغاء
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
