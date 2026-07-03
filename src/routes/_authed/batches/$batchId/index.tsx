import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
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
import type { DraftPreview } from "@/lib/server/batch-service"
import {
  getBatch,
  getDraftPreview,
  softDeleteBatch,
} from "@/lib/server/batch-service"

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sending: "جارٍ الإرسال",
  completed: "مكتملة",
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

      {batch.status === "draft" && preview && <DraftReview preview={preview} />}
      {batch.status === "draft" && !preview && (
        <p className="text-muted-foreground">تعذر تحميل المعاينة.</p>
      )}
      {batch.status === "sending" && (
        <Card>
          <CardContent className="pt-6">
            <p>جارٍ إرسال الرسائل... سيتم تفعيل تتبع التقدم في المرحلة 6.</p>
          </CardContent>
        </Card>
      )}
      {batch.status === "completed" && (
        <Card>
          <CardContent className="pt-6">
            <p>
              اكتملت الدفعة. مرسلة: {batch.sent} — فاشلة: {batch.failed}. سيتم
              تفعيل التفاصيل في المرحلة 6.
            </p>
          </CardContent>
        </Card>
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

function DraftReview({ preview }: { preview: DraftPreview }) {
  const [acknowledged, setAcknowledged] = useState(false)

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
        <Button disabled={!acknowledged || preview.matched.length === 0}>
          إرسال
        </Button>
        <Button variant="ghost" render={<Link to="/batches" />}>
          رجوع
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        زر الإرسال سيفعّل في المرحلة 6 (إرسال SMS).
      </p>
    </div>
  )
}
