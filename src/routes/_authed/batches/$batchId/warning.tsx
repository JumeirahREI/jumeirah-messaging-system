import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowRight, Send, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
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
import type { WarningEligibleInvoice } from "@/lib/server/batch-service"
import {
  getBatch,
  getWarningEligible,
  sendWarning,
} from "@/lib/server/batch-service"

export const Route = createFileRoute("/_authed/batches/$batchId/warning")({
  loader: async ({ params }) => {
    const batchId = Number(params.batchId)
    if (Number.isNaN(batchId)) throw new Error("معرّف دفعة غير صالح")
    const batch = await getBatch({ data: { id: batchId } })
    if (!batch) throw new Error("الدفعة غير موجودة")
    if (batch.status !== "completed") {
      throw new Error("الدفعة غير مكتملة")
    }
    const eligible = await getWarningEligible({ data: { batchId } })
    if (eligible === null) throw new Error("تعذر تحميل البيانات")
    return { batch, eligible }
  },
  component: WarningPage,
})

function WarningPage() {
  const { batch, eligible } = Route.useLoaderData()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const allSelected = eligible.length > 0 && selected.size === eligible.length

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(eligible.map((e) => e.invoiceId))
    )
  }

  async function handleSend() {
    setSending(true)
    const res = await sendWarning({
      data: { batchId: batch.id, invoiceIds: Array.from(selected) },
    })
    setSending(false)
    setConfirmOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم إرسال التحذيرات")
    navigate({ to: "/batches/$batchId", params: { batchId: String(batch.id) } })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="تحذيرات المتابعة"
        description={`${batch.title} — ${batch.projectTitle}`}
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                to="/batches/$batchId"
                params={{ batchId: String(batch.id) }}
              />
            }
          >
            <ArrowRight data-icon="inline-start" />
            رجوع
          </Button>
        }
      />

      {eligible.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="لا توجد فواتير مؤهلة"
          description="جميع الشقق لها تحذيرات مرسلة بالفعل."
        />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
              disabled={sending}
            >
              {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {selected.size} من {eligible.length} محدد
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>الفواتير المؤهلة للتحذير</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleAll}
                          disabled={sending}
                        />
                      </TableHead>
                      <TableHead>الشقة</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead className="tabular-nums">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligible.map((inv: WarningEligibleInvoice) => (
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
                        <TableCell className="tabular-nums">
                          {inv.total.toLocaleString("ar-EG")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={selected.size === 0 || sending}
            >
              <Send data-icon="inline-start" />
              {sending
                ? "جارٍ الإرسال..."
                : `إرسال التحذيرات (${selected.size})`}
            </Button>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="تأكيد إرسال التحذيرات"
            description={`سيتم إرسال تحذيرات متابعة إلى ${selected.size} فاترة. هل تريد المتابعة؟`}
            confirmLabel="إرسال"
            busy={sending}
            onConfirm={handleSend}
          />
        </>
      )}
    </div>
  )
}
