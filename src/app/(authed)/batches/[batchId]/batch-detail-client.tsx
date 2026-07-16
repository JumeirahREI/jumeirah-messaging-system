"use client"

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  User,
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
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
import { useIsMobile } from "@/hooks/use-mobile"
import { useBatchStatus } from "@/lib/hooks/use-batch-status"
import { toDisplayFormat } from "@/lib/phone"
import type {
  BatchDetail,
  BatchStatusMessage,
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
    success: "text-success-foreground",
    destructive: "text-destructive",
    warning: "text-warning-foreground",
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
  const [unmatchedAck, setUnmatchedAck] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [noContactsOpen, setNoContactsOpen] = useState(false)

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
        <Alert className="border-warning/40 bg-warning/5 text-warning-foreground">
          <TriangleAlert className="size-4" />
          <AlertTitle>لا توجد شقق جاهزة للإرسال</AlertTitle>
          <AlertDescription className="text-warning-foreground/90">
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
          <Alert className="border-info/40 bg-info/5 text-info-foreground">
            <Building2 className="size-4" />
            <AlertTitle>شقق غير مضمونة في الملف</AlertTitle>
            <AlertDescription className="text-info-foreground/90">
              {preview.missing.length} شقة موجودة في قاعدة البيانات ولكنها غير
              موجودة في ملف Excel. تأكد من عدم نسيان أي شقة.
            </AlertDescription>
            <AlertAction>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
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
            <div className="flex flex-col gap-3 sm:hidden">
              {preview.missing.map((m) => (
                <Card key={m.label} size="sm">
                  <CardContent className="flex flex-col gap-1">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-sm text-muted-foreground">
                      {m.towerLabel}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="hidden max-h-[60vh] overflow-auto rounded-lg border sm:block">
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
        <section className="rounded-xl border border-warning/40 bg-warning/5 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-heading text-base font-medium text-warning-foreground">
            <AlertTriangle className="size-5" />
            شقق بدون مستلمي إشعارات
          </div>
          <p className="text-sm text-muted-foreground">
            هذه الشقق لن يتم إرسال رسائل لها. أضف جهة اتصال ورقم هاتف لتفعيل
            الإرسال.
          </p>
          <div className="flex flex-col gap-3 sm:hidden">
            {preview.noContacts.map((c) => (
              <Card key={c.apartmentId} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {c.clientName}
                      </span>
                    </div>
                    <NoContactAddButton
                      apartmentId={c.apartmentId}
                      allContacts={allContacts}
                      onMutate={() => router.refresh()}
                    />
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    الإجمالي: {c.total.toLocaleString("en-US")}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-hidden p-0 sm:block">
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
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-medium">الشقق المطابقة</h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {totalRecipients} رسالة
            </span>
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              disabled={
                noRecipients ||
                (preview.unmatched.length > 0 && !unmatchedAck) ||
                sending
              }
              onClick={() =>
                preview.noContacts.length > 0
                  ? setNoContactsOpen(true)
                  : setConfirmOpen(true)
              }
            >
              <Send data-icon="inline-start" />
              {noRecipients ? "لا يوجد مستلمون" : "إرسال"}
            </Button>
          </div>
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
          <>
            <div className="flex flex-col gap-3 sm:hidden">
              {filteredMatched.map((m) => (
                <Card key={m.invoiceId} size="sm">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {m.clientName}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <span>
                        جهات الاتصال:{" "}
                        {m.contacts.map((c) => c.contactName).join("، ")}
                      </span>
                      <span className="tabular-nums">
                        الهاتف:{" "}
                        {m.contacts
                          .flatMap((c) => c.phoneNumbers)
                          .map(toDisplayFormat)
                          .join("، ")}
                      </span>
                    </div>
                    <span className="text-sm tabular-nums">
                      الإجمالي: {m.total.toLocaleString("en-US")}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="hidden rounded-lg border sm:block">
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
                        {m.contacts
                          .flatMap((c) => c.phoneNumbers)
                          .map(toDisplayFormat)
                          .join("، ")}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {m.total.toLocaleString("en-US")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {search.trim() !== "" && preview.matched.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {filteredMatched.length} من {preview.matched.length}
          </p>
        )}
      </section>

      <Dialog open={noContactsOpen} onOpenChange={setNoContactsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning-foreground">
              <AlertTriangle className="size-5" />
              شقق بدون مستلمي إشعارات
            </DialogTitle>
            <DialogDescription>
              {preview.noContacts.length} شقة من أصل {preview.coverage.total} لا
              تحتوي على جهات اتصال بأرقام هاتف. لن يتم إرسال رسائل لهذه الشقق.
              يمكنك إضافة جهات اتصال من الجدول أدناه قبل الإرسال.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 sm:hidden">
            {preview.noContacts.map((c) => (
              <Card key={c.apartmentId} size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.clientName}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden max-h-[40vh] overflow-auto rounded-lg border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشقة</TableHead>
                  <TableHead>العميل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.noContacts.map((c) => (
                  <TableRow key={c.apartmentId}>
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.clientName}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNoContactsOpen(false)
                setConfirmOpen(true)
              }}
            >
              فهمت
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
  const [selectedApartment, setSelectedApartment] = useState<string | null>(
    null
  )
  const isMobile = useIsMobile()

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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-3">
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
            <>
              <div className="flex flex-col gap-3 sm:hidden">
                {filteredMessages.map((m) => (
                  <Card
                    key={m.id}
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setSelectedApartment(m.apartmentLabel)}
                  >
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{m.apartmentLabel}</span>
                        <MessageStatusBadge status={m.status} />
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <span>{m.contactName ?? "—"}</span>
                        <span className="tabular-nums">
                          {toDisplayFormat(m.phoneNumber)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span>
                          {m.templateType === "notification"
                            ? "إشعار"
                            : "تحذير"}
                        </span>
                        {m.errorReason && (
                          <span className="text-destructive">
                            {m.errorReason}
                          </span>
                        )}
                        <span className="text-muted-foreground tabular-nums">
                          {m.sentAt ? formatDate(m.sentAt) : "—"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="hidden rounded-lg border sm:block">
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
                      <TableRow
                        key={m.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedApartment(m.apartmentLabel)}
                      >
                        <TableCell className="font-medium">
                          {m.apartmentLabel}
                        </TableCell>
                        <TableCell>{m.contactName ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {toDisplayFormat(m.phoneNumber)}
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
            </>
          )}
          {search.trim() !== "" && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {filteredMessages.length} من {status.messages.length}
            </p>
          )}
        </div>
        {!isMobile && selectedApartment && (
          <aside className="flex flex-col self-stretch overflow-hidden rounded-lg border lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
            <InvoiceMessagePanelContent
              apartmentLabel={selectedApartment}
              messages={status.messages}
              onClose={() => setSelectedApartment(null)}
            />
          </aside>
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

      {isMobile && (
        <Sheet
          open={selectedApartment !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedApartment(null)
          }}
        >
          <SheetContent side="bottom" className="max-h-[85vh] gap-0 p-0">
            <SheetTitle className="sr-only">{selectedApartment}</SheetTitle>
            {selectedApartment && (
              <InvoiceMessagePanelContent
                apartmentLabel={selectedApartment}
                messages={status.messages}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

function InvoiceMessagePanelContent({
  apartmentLabel,
  messages,
  onClose,
}: {
  apartmentLabel: string
  messages: BatchStatusMessage[]
  onClose?: () => void
}) {
  const apartmentMessages = useMemo(() => {
    return messages.filter((m) => m.apartmentLabel === apartmentLabel)
  }, [messages, apartmentLabel])

  const sent = apartmentMessages.filter((m) => m.status === "sent").length
  const failed = apartmentMessages.filter((m) => m.status === "failed").length

  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 font-heading text-lg font-medium">
            <Building2 className="size-5 text-muted-foreground" />
            {apartmentLabel}
          </h3>
          <p className="text-sm text-muted-foreground tabular-nums">
            {apartmentMessages.length} رسالة — {sent} مرسلة، {failed} فاشلة
          </p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <XCircle className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {apartmentMessages.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <User className="size-4 text-muted-foreground" />
                  {m.contactName ?? "غير معروف"}
                </div>
                <MessageStatusBadge status={m.status} />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                <Phone className="size-4" />
                {toDisplayFormat(m.phoneNumber)}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="size-4" />
                {m.templateType === "notification" ? "إشعار" : "تحذير"}
              </div>
              {m.errorReason && (
                <div className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {m.errorReason}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <Clock className="size-3.5" />
                {m.sentAt ? formatDate(m.sentAt) : "لم يُرسل بعد"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
