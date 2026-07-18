"use client"

import { ArrowRight, Send, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import type {
  BatchDetail,
  WarningEligibleInvoice,
} from "@/lib/server/batch-service"
import { sendWarning } from "@/lib/server/batch-service"

export function WarningClient({
  batch,
  eligible,
}: {
  batch: BatchDetail
  eligible: WarningEligibleInvoice[]
}) {
  const router = useRouter()
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
      batchId: batch.id,
      invoiceIds: Array.from(selected),
    })
    setSending(false)
    setConfirmOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("تم إرسال التحذيرات")
    router.push(`/batches/${batch.id}`)
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
            render={<Link href={`/batches/${batch.id}`} />}
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
              <div className="flex flex-col gap-3 md:hidden">
                {eligible.map((inv) => (
                  <label
                    key={inv.invoiceId}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-3"
                  >
                    <Checkbox
                      checked={selected.has(inv.invoiceId)}
                      onCheckedChange={() => toggle(inv.invoiceId)}
                      disabled={sending}
                      className="mt-0.5"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">{inv.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {inv.clientName}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        الإجمالي: {inv.total.toLocaleString("en-US")}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="hidden rounded-lg border md:block">
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
                        <TableCell className="tabular-nums">
                          {inv.total.toLocaleString("en-US")}
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
            description={`سيتم إرسال تحذيرات متابعة إلى ${selected.size} فاتورة. هل تريد المتابعة؟`}
            confirmLabel="إرسال"
            busy={sending}
            onConfirm={handleSend}
          />
        </>
      )}
    </div>
  )
}
