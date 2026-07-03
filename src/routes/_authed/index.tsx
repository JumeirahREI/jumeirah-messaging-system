import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const ERROR_MESSAGES: Record<string, string> = {
  "admin-only": "هذه الصفحة متاحة للمسؤولين فقط",
}

export const Route = createFileRoute("/_authed/")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: Dashboard,
})

function Dashboard() {
  const { session } = Route.useRouteContext()
  const { error } = Route.useSearch()

  useEffect(() => {
    if (error && ERROR_MESSAGES[error]) {
      toast.error(ERROR_MESSAGES[error])
    }
  }, [error])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-medium">لوحة التحكم</h1>
        <p className="text-muted-foreground">
          مرحبًا {session.fullname} — دور: {session.isAdmin ? "مسؤول" : "مشغّل"}
        </p>
      </div>
      <div className="flex gap-2">
        <Button render={<Link to="/batches/new" />}>دفعة جديدة</Button>
        <Button variant="outline" render={<Link to="/batches" />}>
          الدفعات
        </Button>
      </div>
    </div>
  )
}
