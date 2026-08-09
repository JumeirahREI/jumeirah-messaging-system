"use client"

import {
  ArrowRight,
  FileSpreadsheet,
  Send,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { CurrencyInput } from "@/components/currency-input"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
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
import {
  applyWarningExcel,
  sendWarning,
  updateWarningAmount,
} from "@/lib/server/batch-service"

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
  const [overrides, setOverrides] = useState<Record<number, number>>({})
  const [format, setFormat] = useState<"balance" | "invoice">("balance")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const baseTotals = useMemo(
    () => Object.fromEntries(eligible.map((e) => [e.invoiceId, e.total])),
    [eligible]
  )

  function displayTotal(invoiceId: number): number {
    return overrides[invoiceId] ?? baseTotals[invoiceId] ?? 0
  }

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

  async function commitTotal(invoiceId: number, next: number) {
    setOverrides((prev) => ({ ...prev, [invoiceId]: next }))
    const res = await updateWarningAmount({ invoiceId, total: next })
    if (!res.ok) {
      toast.error(res.error)
      setOverrides((prev) => ({
        ...prev,
        [invoiceId]: baseTotals[invoiceId] ?? 0,
      }))
    }
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.set("batchId", String(batch.id))
    fd.set("format", format)
    fd.set("file", file)
    const res = await applyWarningExcel(fd)
    setUploading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const parts: string[] = []
    if (res.updated > 0) parts.push(`${res.updated} شقة مُحدّثة`)
    if (res.unmatched.length > 0)
      parts.push(`${res.unmatched.length} تسمية غير مطابقة`)
    if (res.skippedWarning > 0)
      parts.push(`${res.skippedWarning} شقة لديها تحذير بالفعل`)
    if (res.skippedInvalid > 0)
      parts.push(`${res.skippedInvalid} مبلغ غير صالح`)
    toast.success(parts.length > 0 ? parts.join(" — ") : "تم تحديث المبالغ")
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    setOverrides({})
    router.refresh()
  }

  async function handleSend() {
    setSending(true)
    const amounts: Record<number, number> = {}
    for (const id of selected) {
      if (id in overrides) {
        amounts[id] = overrides[id]
      }
    }
    const res = await sendWarning({
      batchId: batch.id,
      invoiceIds: Array.from(selected),
      amounts,
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
          <Card>
            <CardHeader>
              <CardTitle>تحديث المبالغ من ملف Excel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex flex-1 flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="excel-format">
                    صيغة الملف
                  </label>
                  <NativeSelect
                    id="excel-format"
                    value={format}
                    onChange={(e) =>
                      setFormat(e.target.value as "balance" | "invoice")
                    }
                    disabled={uploading}
                    className="w-full"
                  >
                    <NativeSelectOption value="balance">
                      كشف أرصدة العملاء
                    </NativeSelectOption>
                    <NativeSelectOption value="invoice">
                      فواتير تفصيلية
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate text-sm font-medium">
                          {file.name}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setFile(null)
                          if (fileInputRef.current)
                            fileInputRef.current.value = ""
                        }}
                        disabled={uploading}
                        aria-label="إزالة الملف"
                      >
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full"
                    >
                      <Upload data-icon="inline-start" />
                      اختر ملف Excel
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                >
                  {uploading ? "جارٍ التحديث..." : "تحديث"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                يمكن أن يحتوي الملف على شقق فرعية فقط (التي بها مبلغ مستحق).
                سيتم تجاهل التسميات غير المطابقة والمبالغ غير الصالحة.
              </p>
            </CardContent>
          </Card>

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
                      <CurrencyInput
                        value={displayTotal(inv.invoiceId)}
                        onCommit={(next) => commitTotal(inv.invoiceId, next)}
                        disabled={sending}
                        ariaLabel={`المبلغ للشقة ${inv.label}`}
                      />
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
                      <TableHead className="tabular-nums">المبلغ</TableHead>
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
                          <CurrencyInput
                            value={displayTotal(inv.invoiceId)}
                            onCommit={(next) =>
                              commitTotal(inv.invoiceId, next)
                            }
                            disabled={sending}
                            ariaLabel={`المبلغ للشقة ${inv.label}`}
                          />
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
