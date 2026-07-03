import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  archiveBatch,
  listBatches,
  softDeleteBatch,
} from "@/lib/server/batch-service"

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sending: "جارٍ الإرسال",
  completed: "مكتملة",
}

export const Route = createFileRoute("/_authed/batches/")({
  loader: async () =>
    await listBatches({
      data: { page: 1, status: "all", includeArchived: false },
    }),
  component: BatchesListPage,
})

function BatchesListPage() {
  const initial = Route.useLoaderData()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [includeArchived, setIncludeArchived] = useState(false)
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  async function reload() {
    setLoading(true)
    const res = await listBatches({
      data: {
        page,
        status: statusFilter as "all" | "draft" | "sending" | "completed",
        includeArchived,
      },
    })
    setLoading(false)
    setData(res)
  }

  async function handleFilterChange(newStatus: string, newArchived: boolean) {
    setStatusFilter(newStatus)
    setIncludeArchived(newArchived)
    setPage(1)
    setLoading(true)
    const res = await listBatches({
      data: {
        page: 1,
        status: newStatus as "all" | "draft" | "sending" | "completed",
        includeArchived: newArchived,
      },
    })
    setLoading(false)
    setData(res)
  }

  async function handlePageChange(newPage: number) {
    setPage(newPage)
    setLoading(true)
    const res = await listBatches({
      data: {
        page: newPage,
        status: statusFilter as "all" | "draft" | "sending" | "completed",
        includeArchived,
      },
    })
    setLoading(false)
    setData(res)
  }

  async function handleArchive(id: number) {
    const res = await archiveBatch({ data: { id } })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تمت الأرشفة")
    reload()
  }

  async function handleDelete(id: number) {
    const res = await softDeleteBatch({ data: { id } })
    setConfirmDeleteId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم حذف الدفعة")
    reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">الدفعات</h1>
        <Button render={<Link to="/batches/new" />}>دفعة جديدة</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => v && handleFilterChange(v, includeArchived)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="sending">جارٍ الإرسال</SelectItem>
            <SelectItem value="completed">مكتملة</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="archived"
            checked={includeArchived}
            onCheckedChange={(v) =>
              handleFilterChange(statusFilter, v === true)
            }
          />
          <label htmlFor="archived" className="text-sm">
            عرض المؤرشفة
          </label>
        </div>
        {loading && (
          <span className="text-sm text-muted-foreground">جارٍ...</span>
        )}
      </div>

      {data.rows.length === 0 ? (
        <p className="text-muted-foreground">لا توجد دفعات.</p>
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
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((b) => (
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
                    {b.createdAt}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      {b.status === "completed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchive(b.id)}
                          disabled={loading}
                        >
                          أرشفة
                        </Button>
                      )}
                      {b.status === "draft" &&
                        (confirmDeleteId === b.id ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(b.id)}
                              disabled={loading}
                            >
                              تأكيد
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={loading}
                            >
                              إلغاء
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(b.id)}
                            disabled={loading}
                          >
                            حذف
                          </Button>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            صفحة {data.page} من {data.totalPages} ({data.total} دفعة)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1 || loading}
              onClick={() => handlePageChange(data.page - 1)}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages || loading}
              onClick={() => handlePageChange(data.page + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
