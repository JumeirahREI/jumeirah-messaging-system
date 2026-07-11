"use client"

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  AddContactDialog,
  type ContactRow,
} from "@/components/add-contact-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { BatchStatusBadge, MessageStatusBadge } from "@/components/status-badge"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBatchStatus } from "@/lib/hooks/use-batch-status"
import type {
  BatchDetail,
  BatchStatusResponse,
  DraftPreview,
} from "@/lib/server/batch-service"
import {
  retryFailed,
  sendBatch,
  softDeleteBatch,
} from "@/lib/server/batch-service"
import { formatDate } from "@/lib/utils"

export function BatchDetailClient({
  batch,
  preview,
  allContacts,
}: {
  batch: BatchDetail
  preview: DraftPreview | null
  allContacts: ContactRow[]
}) {
  const router = useRouter()
  const { data: status } = useBatchStatus(batch.id, batch.status)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={batch.title}
        description={`${batch.projectTitle}`}
        actions={
          <>
            <BatchStatusBadge status={batch.status} />
            {batch.status === "draft" && <DeleteBatchButton id={batch.id} />}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/batches" />}
            >
              <ArrowRight data-icon="inline-start" />
              رجوع
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">#{batch.id}</span>
        <Separator orientation="vertical" className="h-4" />
        <span className="tabular-nums">
          {batch.createdAt ? formatDate(batch.createdAt) : "—"}
        </span>
        {(batch.status === "sending" || batch.status === "completed") &&
          status && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="tabular-nums">{status.total} رسالة</span>
            </>
          )}
      </div>

      {batch.status === "draft" && preview && (
        <DraftReview
          batch={batch}
          preview={preview}
          allContacts={allContacts}
        />
      )}
      {batch.status === "draft" && !preview && (
        <Skeleton className="h-64 w-full" />
      )}
      {(batch.status === "sending" || batch.status === "completed") &&
        status && (
          <ProgressView
            batch={batch}
            status={status}
            onRefresh={() => router.refresh()}
          />
        )}
      {(batch.status === "sending" || batch.status === "completed") &&
        !status && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
    </div>
  )
}

function DeleteBatchButton({ id }: { id: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    setBusy(true)
    const res = await softDeleteBatch({ id })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم حذف دفعة الرسائل")
    router.push("/batches?page=1&status=all&archived=false")
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        className="hover:bg-destructive/10 hover:text-destructive"
        aria-label="حذف"
      >
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="حذف دفعة الرسائل"
        description="هل أنت متأكد من حذف دفعة الرسائل هذه؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        destructive
        busy={busy}
        onConfirm={handleDelete}
      />
    </>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone?: "default" | "success" | "destructive" | "warning"
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    destructive: "text-destructive",
    warning: "text-amber-600 dark:text-amber-400",
  }[tone]
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-lg bg-muted ${toneClass}`}
        >
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span
            className={`font-heading text-2xl font-semibold tabular-nums ${toneClass}`}
          >
            {value}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function DraftReview({
  batch,
  preview,
  allContacts,
}: {
  batch: BatchDetail
  preview: DraftPreview
  allContacts: ContactRow[]
}) {
  const router = useRouter()
  const [acknowledged, setAcknowledged] = useState(false)
  const [unmatchedAck, setUnmatchedAck] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [search, setSearch] = useState("")

  const noRecipients = preview.matched.length === 0

  const coveragePercent = useMemo(() => {
    if (preview.coverage.total === 0) return 0
    return Math.round((preview.coverage.matched / preview.coverage.total) * 100)
  }, [preview.coverage])

  const totalRecipients = useMemo(
    () =>
      preview.matched.reduce(
        (sum, m) => sum + m.contacts.flatMap((c) => c.phoneNumbers).length,
        0
      ),
    [preview]
  )

  const filteredMatched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === "") return preview.matched
    return preview.matched.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.clientName.toLowerCase().includes(q)
    )
  }, [preview.matched, search])

  async function handleSend() {
    setSending(true)
    const res = await sendBatch({ batchId: batch.id })
    setSending(false)
    setConfirmOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("بدأ الإرسال")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {noRecipients && (
        <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-4" />
          <AlertTitle>لا توجد شقق جاهزة للإرسال</AlertTitle>
          <AlertDescription className="text-amber-700/90 dark:text-amber-400/90">
            جميع الشقق المطابقة لا تحتوي على مستلمي إشعارات بأرقام هاتف. أضف
            جهات اتصال وأرقام هاتف للشقق، ثم حدّث هذه الصفحة.{" "}
            <Link
              href={`/admin/projects/${batch.projectId}`}
              className="font-medium underline underline-offset-4"
            >
              إدارة جهات اتصال المشروع
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={<Mail />}
          label="شقق مطابقة"
          value={preview.matched.length}
        />
        <StatCard
          icon={<Send />}
          label="مستلمون"
          value={totalRecipients}
          tone="success"
        />
        <StatCard
          icon={<AlertTriangle />}
          label="بدون مستلمين"
          value={preview.noContacts.length}
          tone={preview.noContacts.length > 0 ? "warning" : "default"}
        />
        <Card>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <Building2 />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  تغطية المشروع
                </span>
                <span className="font-heading text-2xl font-semibold tabular-nums">
                  {preview.coverage.matched}/{preview.coverage.total}
                </span>
              </div>
            </div>
            <Progress value={coveragePercent}>
              <ProgressLabel className="sr-only">التغطية</ProgressLabel>
            </Progress>
          </CardContent>
        </Card>
      </div>

      {preview.unmatched.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5" />
              تسميات غير مطابقة
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              هذه التسميات موجودة في ملف Excel ولكنها غير موجودة في قاعدة
              البيانات. لن يتم إرسال رسائل لها. يجب الإقرار بذلك قبل الإرسال.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {preview.unmatched.map((l) => (
                <span
                  key={l}
                  className="rounded bg-destructive/15 px-2 py-0.5 text-xs font-medium"
                >
                  {l}
                </span>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={unmatchedAck}
                onCheckedChange={(v) => setUnmatchedAck(v === true)}
              />
              أقر بأن هذه الشقق لن يتم إرسال رسائل لها
            </label>
          </CardContent>
        </Card>
      )}

      {preview.missing.length > 0 && (
        <Dialog>
          <Alert className="border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-400">
            <Building2 className="size-4" />
            <AlertTitle>شقق غير مضمونة في الملف</AlertTitle>
            <AlertDescription className="text-blue-700/90 dark:text-blue-400/90">
              {preview.missing.length} شقة موجودة في قاعدة البيانات ولكنها غير
              موجودة في ملف Excel. تأكد من عدم نسيان أي شقة.
            </AlertDescription>
            <AlertAction>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm" nativeButton={false} />
                }
              >
                عرض الشقق
              </DialogTrigger>
            </AlertAction>
          </Alert>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>شقق غير مضمونة في الملف</DialogTitle>
              <DialogDescription>
                هذه الشقق موجودة في قاعدة البيانات ولكنها غير موجودة في ملف
                Excel.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشقة</TableHead>
                    <TableHead>البرج</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.missing.map((m) => (
                    <TableRow key={m.label}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.towerLabel}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {preview.noContacts.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-5" />
              شقق بدون مستلمي إشعارات
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              هذه الشقق لن يتم إرسال رسائل لها. أضف جهة اتصال ورقم هاتف لتفعيل
              الإرسال.
            </p>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشقة</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead className="tabular-nums">الإجمالي</TableHead>
                    <TableHead className="text-end">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.noContacts.map((c) => (
                    <TableRow key={c.apartmentId}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell>{c.clientName}</TableCell>
                      <TableCell className="tabular-nums">
                        {c.total.toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-end">
                        <NoContactAddButton
                          apartmentId={c.apartmentId}
                          allContacts={allContacts}
                          onMutate={() => router.refresh()}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!noRecipients && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                />
                أقر بأن هذه الشقق لن يتم إرسال رسائل لها
              </label>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-medium">الشقق المطابقة</h2>
          {preview.matched.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute inset-y-0 inset-s-3 my-auto size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالشقة أو العميل"
                className="ps-9"
                aria-label="بحث في الشقق المطابقة"
              />
            </div>
          )}
        </div>
        {preview.matched.length === 0 ? (
          <EmptyState
            icon={<Mail />}
            title="لا توجد شقق مطابقة"
            description="لم يتم العثور على شقق لها أرقام هاتف في هذا الملف."
          />
        ) : filteredMatched.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="لا نتائج"
            description="لا توجد شقق مطابقة لبحثك."
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشقة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>جهات الاتصال</TableHead>
                  <TableHead>أرقام الهاتف</TableHead>
                  <TableHead className="tabular-nums">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatched.map((m) => (
                  <TableRow key={m.invoiceId}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell>{m.clientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.contacts.map((c) => c.contactName).join("، ")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {m.contacts.flatMap((c) => c.phoneNumbers).join("، ")}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {m.total.toLocaleString("en-US")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {search.trim() !== "" && preview.matched.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {filteredMatched.length} من {preview.matched.length}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="text-sm text-muted-foreground tabular-nums">
          {totalRecipients} رسالة إلى {preview.matched.length} شقة
        </span>
        <Button
          disabled={
            noRecipients ||
            (preview.noContacts.length > 0 && !acknowledged) ||
            (preview.unmatched.length > 0 && !unmatchedAck) ||
            sending
          }
          onClick={() => setConfirmOpen(true)}
        >
          <Send data-icon="inline-start" />
          {noRecipients ? "لا يوجد مستلمون" : "إرسال"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد الإرسال"
        description={`سيتم إرسال ${totalRecipients} رسالة إلى ${preview.matched.length} شقة. هل تريد المتابعة؟`}
        confirmLabel="إرسال الآن"
        busy={sending}
        onConfirm={handleSend}
      />
    </div>
  )
}

function NoContactAddButton({
  apartmentId,
  allContacts,
  onMutate,
}: {
  apartmentId: number
  allContacts: ContactRow[]
  onMutate: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <AddContactDialog
      apartmentId={apartmentId}
      available={allContacts}
      open={open}
      onOpenChange={setOpen}
      onMutate={onMutate}
    />
  )
}

function ProgressView({
  batch,
  status,
  onRefresh,
}: {
  batch: BatchDetail
  status: BatchStatusResponse
  onRefresh: () => void
}) {
  const [retrying, setRetrying] = useState(false)
  const [retryConfirm, setRetryConfirm] = useState(false)
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "pending">(
    "all"
  )
  const [search, setSearch] = useState("")

  const percent =
    status.total > 0
      ? Math.round(((status.sent + status.failed) / status.total) * 100)
      : 0
  const isSending = status.status === "sending"

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase()
    return status.messages.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false
      if (q === "") return true
      return (
        m.apartmentLabel.toLowerCase().includes(q) ||
        (m.contactName?.toLowerCase().includes(q) ?? false) ||
        m.phoneNumber.includes(q)
      )
    })
  }, [status.messages, filter, search])

  async function handleRetry() {
    setRetrying(true)
    const res = await retryFailed({ batchId: batch.id })
    setRetrying(false)
    setRetryConfirm(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("بدأ إعادة الإرسال")
    onRefresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={<Mail />} label="الإجمالي" value={status.total} />
        <StatCard
          icon={<CheckCircle2 />}
          label="مرسلة"
          value={status.sent}
          tone="success"
        />
        <StatCard
          icon={<XCircle />}
          label="فاشلة"
          value={status.failed}
          tone={status.failed > 0 ? "destructive" : "default"}
        />
        <StatCard
          icon={isSending ? <Spinner /> : <Clock />}
          label="الحالة"
          value={isSending ? "جارٍ..." : "مكتملة"}
          tone={isSending ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <Progress value={percent}>
            <div className="flex items-center justify-between">
              <ProgressLabel>التقدم</ProgressLabel>
              <span className="text-sm text-muted-foreground tabular-nums">
                {percent}%
              </span>
            </div>
          </Progress>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-medium">الرسائل</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute inset-y-0 inset-s-3 my-auto size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالشقة أو الهاتف"
                className="ps-9"
                aria-label="بحث في الرسائل"
              />
            </div>
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as typeof filter)}
            >
              <TabsList>
                <TabsTrigger value="all">
                  الكل ({status.messages.length})
                </TabsTrigger>
                <TabsTrigger value="sent">مرسلة ({status.sent})</TabsTrigger>
                <TabsTrigger value="failed">
                  فاشلة ({status.failed})
                </TabsTrigger>
                <TabsTrigger value="pending">بانتظار</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        {filteredMessages.length === 0 ? (
          <EmptyState
            icon={<Mail />}
            title="لا توجد رسائل"
            description="لا توجد رسائل بهذه الحالة أو بحثك."
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشقة</TableHead>
                  <TableHead>جهة الاتصال</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الخطأ</TableHead>
                  <TableHead>وقت الإرسال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMessages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.apartmentLabel}
                    </TableCell>
                    <TableCell>{m.contactName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {m.phoneNumber}
                    </TableCell>
                    <TableCell>
                      {m.templateType === "notification" ? "إشعار" : "تحذير"}
                    </TableCell>
                    <TableCell>
                      <MessageStatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="text-sm text-destructive">
                      {m.errorReason ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {m.sentAt ? formatDate(m.sentAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {search.trim() !== "" && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {filteredMessages.length} من {status.messages.length}
          </p>
        )}
      </div>

      {status.status === "completed" && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {status.failed > 0 && (
            <Button onClick={() => setRetryConfirm(true)} disabled={retrying}>
              <RefreshCw data-icon="inline-start" />
              إعادة إرسال الفاشلة ({status.failed})
            </Button>
          )}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/batches/${batch.id}/warning`} />}
          >
            <TriangleAlert data-icon="inline-start" />
            إرسال تحذير متابعة
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={retryConfirm}
        onOpenChange={setRetryConfirm}
        title="إعادة إرسال الفاشلة"
        description={`سيتم إعادة محاولة إرسال ${status.failed} رسالة فاشلة. هل تريد المتابعة؟`}
        confirmLabel="إعادة الإرسال"
        busy={retrying}
        onConfirm={handleRetry}
      />
    </div>
  )
}
