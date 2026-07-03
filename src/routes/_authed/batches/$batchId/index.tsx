import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  BatchDetail,
  BatchStatusResponse,
  DraftPreview,
  WarningEligibleInvoice,
} from "@/lib/server/batch-service"
import {
  getBatch,
  getBatchStatus,
  getDraftPreview,
  getWarningEligible,
  retryFailed,
  sendBatch,
  sendWarning,
  softDeleteBatch,
} from "@/lib/server/batch-service"

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sending: "جارٍ الإرسال",
  completed: "مكتملة",
}

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار",
  sent: "مرسلة",
  failed: "فاشلة",
}

export const Route = createFileRoute("/_authed/batches/$batchId/")({
  loader: async ({ params }) => {
    const batchId = Number(params.batchId)
    if (Number.isNaN(batchId)) throw new Error("معرّف دفعة غير صالح")
    const batch = await getBatch({ data: { id: batchId } })
    if (!batch) throw new Error("الدفعة غير موجودة")
    const preview =
      batch.status === "draft"
        ? await getDraftPreview({ data: { batchId } })
        : null
    return { batch, preview }
  },
  component: BatchDetailPage,
})

function BatchDetailPage() {
  const { batch, preview } = Route.useLoaderData()
  const [status, setStatus] = useState<BatchStatusResponse | null>(null)

  useEffect(() => {
    if (batch.status === "sending" || batch.status === "completed") {
      let cancelled = false
      const poll = async () => {
        const res = await getBatchStatus({ data: { batchId: batch.id } })
        if (cancelled || !res) return
        setStatus(res)
        if (res.status === "sending") {
          setTimeout(poll, 3000)
        }
      }
      poll()
      return () => {
        cancelled = true
      }
    }
  }, [batch.id, batch.status])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">{batch.title}</h1>
          <p className="text-sm text-muted-foreground">
            {batch.projectTitle} — {STATUS_LABELS[batch.status] ?? batch.status}
          </p>
        </div>
        {batch.status === "draft" && <DeleteBatchButton id={batch.id} />}
      </div>

      {batch.status === "draft" && preview && (
        <DraftReview batch={batch} preview={preview} />
      )}
      {batch.status === "draft" && !preview && (
        <p className="text-muted-foreground">تعذر تحميل المعاينة.</p>
      )}
      {(batch.status === "sending" || batch.status === "completed") &&
        status && <ProgressView batch={batch} status={status} />}
      {(batch.status === "sending" || batch.status === "completed") &&
        !status && (
          <p className="text-muted-foreground">جارٍ تحميل الحالة...</p>
        )}
    </div>
  )
}

function DeleteBatchButton({ id }: { id: number }) {
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleDelete() {
    setBusy(true)
    const res = await softDeleteBatch({ data: { id } })
    setBusy(false)
    setConfirmOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم حذف الدفعة")
    window.location.href = "/batches"
  }

  if (!confirmOpen) {
    return (
      <Button
        variant="destructive"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
      >
        حذف الدفعة
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">تأكيد الحذف؟</span>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={busy}
      >
        نعم، حذف
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(false)}
        disabled={busy}
      >
        إلغاء
      </Button>
    </div>
  )
}

function DraftReview({
  batch,
  preview,
}: {
  batch: BatchDetail
  preview: DraftPreview
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [sending, setSending] = useState(false)

  async function handleSend() {
    setSending(true)
    const res = await sendBatch({ data: { batchId: batch.id } })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("بدأ الإرسال")
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-6">
      {preview.noContacts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">
              شقق بدون مستلمي إشعارات
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">
              هذه الشقق لن يتم إرسال رسائل لها. يجب الإقرار بذلك قبل الإرسال.
            </p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشقة</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.noContacts.map((c) => (
                    <TableRow key={c.apartmentId}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell>{c.clientName}</TableCell>
                      <TableCell>{c.total.toLocaleString("ar-EG")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ack"
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
              />
              <label htmlFor="ack" className="text-sm">
                أقر بأن هذه الشقق لن يتم إرسال رسائل لها
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">الشقق المطابقة</h2>
        {preview.matched.length === 0 ? (
          <p className="text-muted-foreground">لا توجد شقق مطابقة.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشقة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>جهات الاتصال</TableHead>
                  <TableHead>أرقام الهاتف</TableHead>
                  <TableHead>الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.matched.map((m) => (
                  <TableRow key={m.invoiceId}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell>{m.clientName}</TableCell>
                    <TableCell>
                      {m.contacts.map((c) => c.contactName).join("، ")}
                    </TableCell>
                    <TableCell>
                      {m.contacts.flatMap((c) => c.phoneNumbers).join("، ")}
                    </TableCell>
                    <TableCell>{m.total.toLocaleString("ar-EG")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          disabled={
            (preview.noContacts.length > 0 && !acknowledged) ||
            preview.matched.length === 0 ||
            sending
          }
          onClick={handleSend}
        >
          {sending ? "جارٍ الإرسال..." : "إرسال"}
        </Button>
        <Button variant="ghost" render={<Link to="/batches" />}>
          رجوع
        </Button>
      </div>
    </div>
  )
}

function ProgressView({
  batch,
  status,
}: {
  batch: BatchDetail
  status: BatchStatusResponse
}) {
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    const res = await retryFailed({ data: { batchId: batch.id } })
    setRetrying(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("بدأ إعادة الإرسال")
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-sm text-muted-foreground">الإجمالي</p>
              <p className="text-lg font-medium">{status.total}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">مرسلة</p>
              <p className="text-lg font-medium text-green-600">
                {status.sent}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">فاشلة</p>
              <p className="text-lg font-medium text-destructive">
                {status.failed}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">الحالة</p>
              <p className="text-lg font-medium">
                {STATUS_LABELS[status.status] ?? status.status}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {status.status === "completed" && status.failed > 0 && (
        <Button onClick={handleRetry} disabled={retrying}>
          {retrying ? "جارٍ إعادة الإرسال..." : "إعادة إرسال الفاشلة"}
        </Button>
      )}

      {status.status === "completed" && <WarningButton batchId={batch.id} />}

      <div className="rounded-md border">
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
            {status.messages.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  {m.apartmentLabel}
                </TableCell>
                <TableCell>{m.contactName ?? "—"}</TableCell>
                <TableCell>{m.phoneNumber}</TableCell>
                <TableCell>
                  {m.templateType === "notification" ? "إشعار" : "تحذير"}
                </TableCell>
                <TableCell>
                  {MESSAGE_STATUS_LABELS[m.status] ?? m.status}
                </TableCell>
                <TableCell className="text-destructive">
                  {m.errorReason ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.sentAt ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function WarningButton({ batchId }: { batchId: number }) {
  const [open, setOpen] = useState(false)
  const [eligible, setEligible] = useState<WarningEligibleInvoice[] | null>(
    null
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)

  async function openModal() {
    setOpen(true)
    setEligible(null)
    setSelected(new Set())
    const res = await getWarningEligible({ data: { batchId } })
    if (res === null) {
      toast.error("الدفعة غير مكتملة")
      setOpen(false)
      return
    }
    setEligible(res)
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend() {
    setSending(true)
    const res = await sendWarning({
      data: { batchId, invoiceIds: Array.from(selected) },
    })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم إرسال التحذيرات")
    setOpen(false)
    window.location.reload()
  }

  return (
    <>
      <Button variant="outline" onClick={openModal}>
        إرسال تحذير متابعة
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border bg-background p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">تحذيرات المتابعة</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                إغلاق
              </Button>
            </div>
            {eligible === null ? (
              <p className="text-muted-foreground">جارٍ التحميل...</p>
            ) : eligible.length === 0 ? (
              <p className="text-muted-foreground">
                جميع الشقق لها تحذيرات مرسلة بالفعل.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  اختر الشقق لإرسال تحذيرات المتابعة:
                </p>
                <div className="mb-4 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>الشقة</TableHead>
                        <TableHead>العميل</TableHead>
                        <TableHead>الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eligible.map((inv) => (
                        <TableRow key={inv.invoiceId}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(inv.invoiceId)}
                              onCheckedChange={() => toggle(inv.invoiceId)}
                              disabled={sending}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {inv.label}
                          </TableCell>
                          <TableCell>{inv.clientName}</TableCell>
                          <TableCell>
                            {inv.total.toLocaleString("ar-EG")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    disabled={sending}
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={selected.size === 0 || sending}
                  >
                    {sending ? "جارٍ الإرسال..." : `إرسال (${selected.size})`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
