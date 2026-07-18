"use client"

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { BatchStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BatchRow } from "@/lib/server/batch-service"
import { archiveBatch, softDeleteBatch } from "@/lib/server/batch-service"
import { formatDate } from "@/lib/utils"

type StatusFilter = "all" | "draft" | "sending" | "completed"

export function BatchesListClient({
  rows,
  page,
  totalPages,
  total,
  status,
  archived,
}: {
  rows: BatchRow[]
  page: number
  totalPages: number
  total: number
  status: StatusFilter
  archived: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  function updateSearch(next: {
    page?: number
    status?: StatusFilter
    archived?: boolean
  }) {
    const p = next.page ?? 1
    const s = next.status ?? status
    const a = next.archived ?? archived
    router.push(`/batches?page=${p}&status=${s}&archived=${a}`)
  }

  async function handleArchive(id: number) {
    setBusy(true)
    const res = await archiveBatch({ id })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تمت الأرشفة")
    router.refresh()
  }

  async function handleDelete() {
    if (confirmDeleteId === null) return
    setBusy(true)
    const res = await softDeleteBatch({ id: confirmDeleteId })
    setBusy(false)
    setConfirmDeleteId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم حذف الدفعة")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الدفعات"
        description="إدارة دفعات الإرسال والمتابعة"
        actions={
          <Button nativeButton={false} render={<Link href="/batches/new" />}>
            <Plus data-icon="inline-start" />
            دفعة جديدة
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          className="w-40"
          value={status}
          onChange={(e) => {
            const v = e.target.value
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
          <NativeSelectOption value="all">الكل</NativeSelectOption>
          <NativeSelectOption value="draft">مسودة</NativeSelectOption>
          <NativeSelectOption value="sending">جارٍ الإرسال</NativeSelectOption>
          <NativeSelectOption value="completed">مكتملة</NativeSelectOption>
        </NativeSelect>
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

      {rows.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title="لا توجد دفعات"
          description="ابدأ بإنشاء دفعة جديدة لرفع ملف الفواتير وإرسال الرسائل."
          action={
            <Button nativeButton={false} render={<Link href="/batches/new" />}>
              <Plus data-icon="inline-start" />
              دفعة جديدة
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((b) => (
              <Card
                key={b.id}
                data-size="sm"
                className="relative ring-foreground/5 transition-all hover:shadow-md hover:ring-primary/30"
              >
                <Link
                  href={`/batches/${b.id}`}
                  className="absolute inset-0 z-10 rounded-xl"
                  aria-label={`فتح ${b.title}`}
                />
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">{b.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.projectTitle}
                      </span>
                    </div>
                    <div className="relative z-20 flex items-center gap-1">
                      <BatchStatusBadge status={b.status} />
                      {b.mode === "manual" && (
                        <span className="rounded bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info">
                          يدوي
                        </span>
                      )}
                      <BatchRowActions
                        batch={b}
                        busy={busy}
                        onArchive={handleArchive}
                        onDelete={setConfirmDeleteId}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <span>
                      مرسلة:{" "}
                      {b.sent > 0 ? (
                        <span className="text-success">{b.sent}</span>
                      ) : (
                        b.sent
                      )}
                    </span>
                    <span>
                      فاشلة:{" "}
                      {b.failed > 0 ? (
                        <span className="text-destructive">{b.failed}</span>
                      ) : (
                        b.failed
                      )}
                    </span>
                    <span>{formatDate(b.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden rounded-lg border md:block">
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
                {rows.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/batches/${b.id}`)}
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/batches/${b.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {b.title}
                      </Link>
                    </TableCell>
                    <TableCell>{b.projectTitle}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <BatchStatusBadge status={b.status} />
                        {b.mode === "manual" && (
                          <span className="rounded bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info">
                            يدوي
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {b.sent > 0 ? (
                        <span className="text-success">{b.sent}</span>
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
                      {formatDate(b.createdAt)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <BatchRowActions
                        batch={b}
                        busy={busy}
                        onArchive={handleArchive}
                        onDelete={setConfirmDeleteId}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            صفحة {page} من {totalPages} ({total} دفعة)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateSearch({ page: page - 1 })}
            >
              السابق
              <ArrowLeft data-icon="inline-start" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateSearch({ page: page + 1 })}
            >
              <ArrowRight data-icon="inline-end" />
              التالي
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

function BatchRowActions({
  batch,
  busy,
  onArchive,
  onDelete,
}: {
  batch: BatchRow
  busy: boolean
  onArchive: (id: number) => void
  onDelete: (id: number) => void
}) {
  if (batch.status !== "completed" && batch.status !== "draft") return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="إجراءات" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {batch.status === "completed" && (
            <DropdownMenuItem
              onClick={() => onArchive(batch.id)}
              disabled={busy}
            >
              <Archive data-icon="inline-start" />
              أرشفة
            </DropdownMenuItem>
          )}
          {batch.status === "draft" && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(batch.id)}
              disabled={busy}
            >
              <Trash2 data-icon="inline-start" />
              حذف
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
