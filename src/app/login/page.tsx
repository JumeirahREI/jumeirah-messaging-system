"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldCheck } from "lucide-react"
import { useForm } from "react-hook-form"
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
import { Spinner } from "@/components/ui/spinner"
import { loginSchema, type LoginFormData } from "@/lib/schemas"

export default function LoginPage() {
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
    if (result?.error) toast.error(result.error)
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-7" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              جُميرا
            </h1>
            <p className="text-sm text-muted-foreground">نظام الرسائل</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader className="text-center">
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
                  <Input
                    id="password"
                    type="password"
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
          </form>
        </Card>
      </div>
    </main>
  )
}
