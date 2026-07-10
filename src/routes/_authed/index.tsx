import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Building2, MessageSquare, Plus, Users } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { BatchStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

function QuickAction({
  to,
  icon,
  label,
  description,
}: {
  to: string
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link to={to} />}
        >
          <Plus />
        </Button>
      </CardContent>
    </Card>
  )
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
  const navigate = useNavigate()

  useEffect(() => {
    if (error && ERROR_MESSAGES[error]) {
      toast.error(ERROR_MESSAGES[error])
    }
  }, [error])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`مرحبًا، ${session.fullname}`}
        description={`${session.isAdmin ? "مسؤول" : "مشغّل"} — لوحة التحكم`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickAction
          to="/batches/new"
          icon={<Plus />}
          label="دفعة رسائل جديدة"
          description="ارفع ملف فواتير وأرسل الرسائل"
        />
        <QuickAction
          to="/batches"
          icon={<MessageSquare />}
          label="دفعات الرسائل"
          description="عرض وإدارة دفعات الرسائل السابقة"
        />
        {session.isAdmin ? (
          <QuickAction
            to="/admin/projects"
            icon={<Building2 />}
            label="إدارة البيانات"
            description="المشاريع والأبراج والشقق"
          />
        ) : (
          <QuickAction
            to="/batches"
            icon={<Users />}
            label="السجل"
            description="استعراض دفعات الرسائل المكتملة"
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">آخر دفعات الرسائل</h2>
        {recentBatches.length === 0 ? (
          <EmptyState
            icon={<Plus />}
            title="لا توجد دفعات رسائل بعد"
            description="ابدأ بإنشاء دفعة رسائل جديدة لرفع ملف الفواتير وإرسال الرسائل."
            action={
              <Button nativeButton={false} render={<Link to="/batches/new" />}>
                <Plus data-icon="inline-start" />
                دفعة رسائل جديدة
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العنوان</TableHead>
                  <TableHead>المشروع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="tabular-nums">مرسلة</TableHead>
                  <TableHead className="tabular-nums">فاشلة</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBatches.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      navigate({
                        to: "/batches/$batchId",
                        params: { batchId: String(b.id) },
                      })
                    }
                  >
                    <TableCell className="font-medium">
                      <Link
                        to="/batches/$batchId"
                        params={{ batchId: String(b.id) }}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {b.title}
                      </Link>
                    </TableCell>
                    <TableCell>{b.projectTitle}</TableCell>
                    <TableCell>
                      <BatchStatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {b.sent > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {b.sent}
                        </span>
                      ) : (
                        b.sent
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {b.failed > 0 ? (
                        <span className="text-destructive">{b.failed}</span>
                      ) : (
                        b.failed
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
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
