"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"

import { JumeirahLogo } from "@/components/jumeirah-logo"
import { toast } from "sonner"

import { loginAction } from "@/app/login/actions"
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
import { PasswordInput } from "@/components/ui/password-input"
import { Spinner } from "@/components/ui/spinner"
import { loginSchema, type LoginFormData } from "@/lib/schemas"

export default function LoginPage() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    const formData = new FormData()
    formData.set("username", data.username)
    formData.set("password", data.password)
    const result = await loginAction(null, formData)
    if (result?.error) {
      toast.error(result.error)
      return
    }
    if (result?.success) {
      router.replace("/batches")
      router.refresh()
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center"></div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-48">
                <JumeirahLogo />
              </div>
              <CardTitle>تسجيل الدخول</CardTitle>
              <CardDescription>أدخل بياناتك للمتابعة</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="username">اسم المستخدم</FieldLabel>
                  <Input
                    id="username"
                    autoComplete="username"
                    disabled={isSubmitting}
                    {...register("username")}
                  />
                  {errors.username && (
                    <p className="text-sm text-destructive">
                      {errors.username.message}
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">كلمة المرور</FieldLabel>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    {...register("password")}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">
                      {errors.password.message}
                    </p>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting ? "جارٍ الدخول..." : "دخول"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </main>
  )
}
