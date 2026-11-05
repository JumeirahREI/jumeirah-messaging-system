"use server"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Buffer } from "node:buffer"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import {
  isBalanceParseError,
  MAX_FILE_SIZE,
  parseBalanceSheetExcel,
} from "@/lib/server/excel-balance-parser"
import { isExcelParseError, parseInvoiceExcel } from "@/lib/server/excel-parser"
import {
  apartments,
  batchSessions,
  invoices,
  messages,
} from "@/lib/server/schema"
import { now, ParsedInvoice, validateInvoiceTotal } from "./shared"

export async function updateInvoiceTotal(input: {
  invoiceId: number
  total: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const invoiceId = (input as { invoiceId?: unknown }).invoiceId
  const total = (input as { total?: unknown }).total
  if (typeof invoiceId !== "number") throw new Error("معرّف الفاتورة مطلوب")
  if (typeof total !== "number" || Number.isNaN(total))
    return { ok: false, error: "المبلغ غير صالح" }
  if (!Number.isFinite(total)) return { ok: false, error: "المبلغ غير صالح" }
  if (total < 0) return { ok: false, error: "المبلغ يجب أن يكون غير سالب" }
  if (total > 9_999_999.99)
    return { ok: false, error: "المبلغ أكبر من الحد الأقصى المسموح" }

  const user = await requireRoleRateLimited("operator")

  const invoiceRows = await db
    .select({
      id: invoices.id,
      batchId: invoices.batchId,
      status: batchSessions.status,
    })
    .from(invoices)
    .innerJoin(batchSessions, eq(invoices.batchId, batchSessions.id))
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
    .limit(1)

  if (invoiceRows.length === 0) {
    return { ok: false, error: "الفاتورة غير موجودة" }
  }
  if (invoiceRows[0].status !== "draft") {
    return { ok: false, error: "لا يمكن تعديل فاتورة في دفعة ليست مسودة" }
  }

  await db
    .update(invoices)
    .set({ total, updatedBy: user.id, updatedAt: now })
    .where(eq(invoices.id, invoiceId))

  return { ok: true }
}

export async function updateWarningAmount(input: {
  invoiceId: number
  total: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const invoiceId = (input as { invoiceId?: unknown }).invoiceId
  const totalRaw = (input as { total?: unknown }).total
  if (typeof invoiceId !== "number") throw new Error("معرّف الفاتورة مطلوب")

  const validation = validateInvoiceTotal(totalRaw)
  if (!validation.ok) return { ok: false, error: validation.error }
  const total = validation.value

  const user = await requireRoleRateLimited("operator")

  const invoiceRows = await db
    .select({
      id: invoices.id,
      batchId: invoices.batchId,
      status: batchSessions.status,
    })
    .from(invoices)
    .innerJoin(batchSessions, eq(invoices.batchId, batchSessions.id))
    .where(
      and(
        eq(invoices.id, invoiceId),
        isNull(invoices.deletedAt),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)

  if (invoiceRows.length === 0) {
    return { ok: false, error: "الفاتورة غير موجودة" }
  }
  if (invoiceRows[0].status !== "completed") {
    return { ok: false, error: "لا يمكن تعديل الفاتورة إلا في دفعة مكتملة" }
  }

  const warningRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.invoiceId, invoiceId),
        eq(messages.templateType, "warning"),
        isNull(messages.deletedAt)
      )
    )

  if ((warningRows[0]?.count ?? 0) > 0) {
    return { ok: false, error: "تم إرسال تحذير لهذه الفاتورة بالفعل" }
  }

  await db
    .update(invoices)
    .set({ total, updatedBy: user.id, updatedAt: now })
    .where(eq(invoices.id, invoiceId))

  return { ok: true }
}

export type WarningExcelResult =
  | {
      ok: true
      updated: number
      unmatched: string[]
      skippedWarning: number
      skippedInvalid: number
    }
  | { ok: false; error: string }

export async function applyWarningExcel(
  formData: FormData
): Promise<WarningExcelResult> {
  if (!(formData instanceof FormData)) throw new Error("متوقع FormData")
  const batchIdRaw = formData.get("batchId")
  const file = formData.get("file")
  const formatRaw = formData.get("format")

  const batchId = Number(batchIdRaw)
  if (Number.isNaN(batchId)) return { ok: false, error: "معرّف الدفعة مطلوب" }
  if (!(file instanceof File)) return { ok: false, error: "الملف مطلوب" }
  const format = formatRaw === "invoice" ? "invoice" : "balance"

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "حجم الملف يتجاوز 10 ميجابايت" }
  }
  const allowedMime = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]
  if (!allowedMime.includes(file.type)) {
    return { ok: false, error: "نوع الملف غير مدعوم. يجب أن يكون ملف Excel" }
  }

  const user = await requireRoleRateLimited("operator")

  const batchRows = await db
    .select({
      id: batchSessions.id,
      status: batchSessions.status,
    })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)

  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير موجودة" }
  }
  if (batchRows[0].status !== "completed") {
    return { ok: false, error: "الدفعة غير مكتملة" }
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { fileTypeFromBuffer } = await import("file-type")
  const detected = await fileTypeFromBuffer(buffer)
  if (
    !detected ||
    detected.mime !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return { ok: false, error: "الملف ليس ملف Excel صالح" }
  }

  let parsed: ParsedInvoice[]
  try {
    if (format === "invoice") {
      parsed = await parseInvoiceExcel(buffer, undefined)
    } else {
      parsed = (await parseBalanceSheetExcel(buffer)).invoices
    }
  } catch (e) {
    const message =
      isExcelParseError(e) || isBalanceParseError(e)
        ? e.message
        : e instanceof Error
          ? e.message
          : "خطأ في تحليل الملف"
    return { ok: false, error: message }
  }

  const invoiceRows = await db
    .select({
      id: invoices.id,
      label: apartments.label,
    })
    .from(invoices)
    .innerJoin(apartments, eq(invoices.apartmentId, apartments.id))
    .where(and(eq(invoices.batchId, batchId), isNull(invoices.deletedAt)))
    .orderBy(apartments.label)

  if (invoiceRows.length === 0) {
    return {
      ok: true,
      updated: 0,
      unmatched: parsed.map((p) => p.label),
      skippedWarning: 0,
      skippedInvalid: 0,
    }
  }

  const labelToInvoice = new Map(invoiceRows.map((i) => [i.label, i.id]))

  const warningRows =
    invoiceRows.length > 0
      ? await db
          .select({ invoiceId: messages.invoiceId })
          .from(messages)
          .where(
            and(
              eq(messages.templateType, "warning"),
              inArray(
                messages.invoiceId,
                invoiceRows.map((i) => i.id)
              ),
              isNull(messages.deletedAt)
            )
          )
          .groupBy(messages.invoiceId)
      : []

  const withWarning = new Set(warningRows.map((w) => w.invoiceId))

  const parsedByLabel = new Map<string, ParsedInvoice>()
  for (const p of parsed) {
    if (!parsedByLabel.has(p.label)) {
      parsedByLabel.set(p.label, p)
    }
  }

  const unmatched: string[] = []
  const skippedWarning: string[] = []
  const skippedInvalid: string[] = []
  const updated: string[] = []

  for (const [label, p] of parsedByLabel) {
    const validation = validateInvoiceTotal(p.total)
    if (!validation.ok) {
      skippedInvalid.push(label)
      continue
    }
    const invoiceId = labelToInvoice.get(label)
    if (!invoiceId) {
      unmatched.push(label)
      continue
    }
    if (withWarning.has(invoiceId)) {
      skippedWarning.push(label)
      continue
    }
    await db
      .update(invoices)
      .set({
        total: validation.value,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(eq(invoices.id, invoiceId))
    updated.push(label)
  }

  return {
    ok: true,
    updated: updated.length,
    unmatched,
    skippedWarning: skippedWarning.length,
    skippedInvalid: skippedInvalid.length,
  }
}
