import { createFileRoute, Link } from "@tanstack/react-router"
import { Building2, Plus, Users } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRecentBatches } from "@/lib/server/batch-service"
import { formatArabicDate } from "@/lib/utils"

const ERROR_MESSAGES: Record<string, string> = {
  "admin-only": "هذه الصفحة متاحة للمسؤولين فقط",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sending: "جارٍ الإرسال",
  completed: "مكتملة",
}

export const Route = createFileRoute("/_authed/")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loader: async () => await getRecentBatches(),
  component: Dashboard,
})

function Dashboard() {
  const { session } = Route.useRouteContext()
  const { error } = Route.useSearch()
  const recentBatches = Route.useLoaderData()

  useEffect(() => {
    if (error && ERROR_MESSAGES[error]) {
      toast.error(ERROR_MESSAGES[error])
    }
  }, [error])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">لوحة التحكم</h1>
        <p className="text-muted-foreground">
          مرحبًا {session.fullname} — دور: {session.isAdmin ? "مسؤول" : "مشغّل"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button render={<Link to="/batches/new" />}>
          <Plus className="size-4" />
          دفعة جديدة
        </Button>
        <Button variant="outline" render={<Link to="/batches" />}>
          الدفعات
        </Button>
        <Button variant="outline" render={<Link to="/admin/projects" />}>
          <Building2 className="size-4" />
          إدارة البيانات
        </Button>
        {session.isAdmin && (
          <Button variant="outline" render={<Link to="/admin/users" />}>
            <Users className="size-4" />
            إدارة المستخدمين
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">آخر الدفعات</h2>
        {recentBatches.length === 0 ? (
          <p className="text-muted-foreground">لا توجد دفعات بعد.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العنوان</TableHead>
                  <TableHead>المشروع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>مرسلة</TableHead>
                  <TableHead>فاشلة</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/batches/$batchId"
                        params={{ batchId: String(b.id) }}
                        className="hover:underline"
                      >
                        {b.title}
                      </Link>
                    </TableCell>
                    <TableCell>{b.projectTitle}</TableCell>
                    <TableCell>{STATUS_LABELS[b.status] ?? b.status}</TableCell>
                    <TableCell>{b.sent}</TableCell>
                    <TableCell>{b.failed}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatArabicDate(b.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
