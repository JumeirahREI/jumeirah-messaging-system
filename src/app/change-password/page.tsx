"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTransition } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { changePasswordAction } from "@/app/change-password/actions"
import { logoutAction } from "@/app/login/actions"
import { JumeirahLogo } from "@/components/jumeirah-logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
    confirmPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  })

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

export default function ChangePasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  })
  const [isLoggingOut, startTransition] = useTransition()

  async function onSubmit(data: ChangePasswordFormData) {
    const formData = new FormData()
    formData.set("newPassword", data.newPassword)
    formData.set("confirmPassword", data.confirmPassword)
    const result = await changePasswordAction(null, formData)
    if (result?.error) toast.error(result.error)
  }

  function handleLogout() {
    startTransition(async () => {
      toast.success("تم تسجيل الخروج")
      await logoutAction()
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader className="text-center">
              <div className="w-48 mx-auto mb-4">
                <JumeirahLogo />
              </div>
              <CardTitle>تغيير كلمة المرور</CardTitle>
              <CardDescription>
                لأسباب أمنية، يجب تعيين كلمة مرور جديدة قبل المتابعة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="newPassword">كلمة المرور الجديدة</FieldLabel>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    {...register("newPassword")}
                  />
                  {errors.newPassword && (
                    <p className="text-sm text-destructive">
                      {errors.newPassword.message}
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">
                    تأكيد كلمة المرور
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    {...register("confirmPassword")}
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || isLoggingOut}
              >
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isSubmitting || isLoggingOut}
                onClick={handleLogout}
              >
                {isLoggingOut && <Spinner data-icon="inline-start" />}
                تسجيل الخروج
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </main>
  )
}
