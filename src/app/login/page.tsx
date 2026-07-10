"use client"

import { ShieldCheck } from "lucide-react"
import { useEffect, useActionState } from "react"
import { toast } from "sonner"

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
import { loginAction } from "@/app/login/actions"

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    }
  }, [state?.error])

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
          <form action={action}>
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
                    name="username"
                    autoComplete="username"
                    required
                    disabled={pending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">كلمة المرور</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={pending}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? "جارٍ الدخول..." : "دخول"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  )
}
