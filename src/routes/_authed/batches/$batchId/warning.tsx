import { Link, createFileRoute } from "@tanstack/react-router"
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
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(eligible.map((e) => e.invoiceId)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  async function handleSend() {
    setSending(true)
    const res = await sendWarning({
      data: { batchId: batch.id, invoiceIds: Array.from(selected) },
    })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم إرسال التحذيرات")
    window.location.href = `/batches/${batch.id}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">تحذيرات المتابعة</h1>
          <p className="text-sm text-muted-foreground">
            {batch.title} — {batch.projectTitle}
          </p>
        </div>
        <Button variant="ghost" render={<Link to="/batches/$batchId" params={{ batchId: String(batch.id) }} />}>
          رجوع
        </Button>
      </div>

      {eligible.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              جميع الشقق لها تحذيرات مرسلة بالفعل. لا توجد فواتير مؤهلة.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={sending}>
              تحديد الكل
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll} disabled={sending}>
              إلغاء التحديد
            </Button>
            <span className="text-sm text-muted-foreground">
              {selected.size} من {eligible.length} محدد
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>الفواتير المؤهلة للتحذير</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
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
                        <TableCell>
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
              onClick={handleSend}
              disabled={selected.size === 0 || sending}
            >
              {sending
                ? "جارٍ الإرسال..."
                : `إرسال التحذيرات (${selected.size})`}
            </Button>
            <Button
              variant="ghost"
              render={<Link to="/batches/$batchId" params={{ batchId: String(batch.id) }} />}
              disabled={sending}
            >
              إلغاء
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
