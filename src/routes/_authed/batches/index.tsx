import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { BatchStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { formatArabicDate } from "@/lib/utils"

type StatusFilter = "all" | "draft" | "sending" | "completed"

export const Route = createFileRoute("/_authed/batches/")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "number" && search.page > 0 ? search.page : 1,
    status: (search.status === "draft" ||
    search.status === "sending" ||
    search.status === "completed"
      ? search.status
      : "all") satisfies StatusFilter,
    archived: search.archived === true,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    status: search.status,
    archived: search.archived,
  }),
  loader: async ({ deps }) =>
    await listBatches({
      data: {
        page: deps.page,
        status: deps.status,
        includeArchived: deps.archived,
      },
    }),
  component: BatchesListPage,
})

function BatchesListPage() {
  const data = Route.useLoaderData()
  const { status, archived } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  function updateSearch(next: {
    page?: number
    status?: StatusFilter
    archived?: boolean
  }) {
    navigate({
      to: "/batches",
      search: {
        page: next.page ?? 1,
        status: next.status ?? status,
        archived: next.archived ?? archived,
      },
    })
  }

  async function handleArchive(id: number) {
    setBusy(true)
    const res = await archiveBatch({ data: { id } })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تمت الأرشفة")
    router.invalidate()
  }

  async function handleDelete() {
    if (confirmDeleteId === null) return
    setBusy(true)
    const res = await softDeleteBatch({ data: { id: confirmDeleteId } })
    setBusy(false)
    setConfirmDeleteId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم حذف الدفعة")
    router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الدفعات"
        description="إدارة دفعات الإرسال والمتابعة"
        actions={
          <Button nativeButton={false} render={<Link to="/batches/new" />}>
            <Plus data-icon="inline-start" />
            دفعة جديدة
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            if (
              v === "all" ||
              v === "draft" ||
              v === "sending" ||
              v === "completed"
            ) {
              updateSearch({ status: v, page: 1 })
            }
          }}
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
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={archived}
            onCheckedChange={(v) =>
              updateSearch({ archived: v === true, page: 1 })
            }
          />
          عرض المؤرشفة
        </label>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title="لا توجد دفعات"
          description="ابدأ بإنشاء دفعة جديدة لرفع ملف الفواتير وإرسال الرسائل."
          action={
            <Button nativeButton={false} render={<Link to="/batches/new" />}>
              <Plus data-icon="inline-start" />
              دفعة جديدة
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
                <TableHead className="w-10"></TableHead>
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
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="إجراءات"
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          {b.status === "completed" && (
                            <DropdownMenuItem
                              onClick={() => handleArchive(b.id)}
                              disabled={busy}
                            >
                              <Archive data-icon="inline-start" />
                              أرشفة
                            </DropdownMenuItem>
                          )}
                          {b.status === "draft" && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setConfirmDeleteId(b.id)}
                              disabled={busy}
                            >
                              <Trash2 data-icon="inline-start" />
                              حذف
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            صفحة {data.page} من {data.totalPages} ({data.total} دفعة)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => updateSearch({ page: data.page - 1 })}
            >
              <ArrowRight data-icon="inline-start" />
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => updateSearch({ page: data.page + 1 })}
            >
              التالي
              <ArrowLeft data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="حذف الدفعة"
        description="هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        destructive
        busy={busy}
        onConfirm={handleDelete}
      />
    </div>
  )
}
