import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login } from "@/lib/server/auth"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context }) => {
    if (context.session) {
      throw redirect({ to: "/", search: { error: undefined } })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await login({ data: { username, password } })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`مرحبًا ${result.user.fullname}`)
    navigate({ to: "/", search: { error: undefined } })
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader className="text-center">
            <CardTitle>تسجيل الدخول</CardTitle>
            <CardDescription>نظام مراسلات جُميرا</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={submitting}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "جارٍ الدخول..." : "دخول"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  )
}
