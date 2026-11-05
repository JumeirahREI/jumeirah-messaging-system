"use server"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import {
  requireRoleRateLimited,
  parseBatchIdInput,
} from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import {
  apartments,
  batchSessions,
  invoices,
  messages,
} from "@/lib/server/schema"
import {
  renderNotification,
  renderWarning,
} from "@/lib/server/template-renderer"
import { invokeBackgroundProcess } from "./dispatch"
import { resolveRecipients } from "./recipients"
import { now, validateInvoiceTotal } from "./shared"

export async function sendBatch(input: {
  batchId: number
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const batchRows = await db
    .select({
      id: batchSessions.id,
      projectId: batchSessions.projectId,
      mode: batchSessions.mode,
    })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "draft"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير موجودة أو ليست مسودة" } as const
  }
  const batchMode = batchRows[0].mode

  const invoiceRows = await db
    .select({
      id: invoices.id,
      apartmentId: invoices.apartmentId,
      clientName: invoices.clientName,
      total: invoices.total,
    })
    .from(invoices)
    .where(and(eq(invoices.batchId, batchId), isNull(invoices.deletedAt)))

  if (invoiceRows.length === 0) {
    return { ok: false, error: "لا توجد فواتير في هذه الدفعة" } as const
  }

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const { phonesByApartment, apartmentsWithContacts } =
    await resolveRecipients(apartmentIds)

  const apartmentLabels = new Map<number, string>(
    apartmentIds.map((aid) => [aid, ""])
  )
  const aptLabelRows = await db
    .select({ id: apartments.id, label: apartments.label })
    .from(apartments)
    .where(inArray(apartments.id, apartmentIds))
  for (const a of aptLabelRows) apartmentLabels.set(a.id, a.label)

  if (batchMode === "manual") {
    const blockingLabels: string[] = []
    for (const inv of invoiceRows) {
      if (!apartmentsWithContacts.has(inv.apartmentId) && inv.total > 0) {
        const label =
          apartmentLabels.get(inv.apartmentId) ?? `#${inv.apartmentId}`
        blockingLabels.push(label)
      }
    }
    if (blockingLabels.length > 0) {
      return {
        ok: false,
        error: `الشقق التالية لها مبالغ ولكن لا توجد أرقام استقبال: ${blockingLabels.join("، ")}`,
      } as const
    }
  }

  const messageInserts: Array<{
    invoiceId: number
    phoneNumberId: number
    contents: string
    templateType: "notification"
    status: "pending"
    createdBy: number
  }> = []
  for (const inv of invoiceRows) {
    if (inv.total <= 0) continue
    const label = apartmentLabels.get(inv.apartmentId) ?? ""
    const body = renderNotification({ amount: inv.total, unit_label: label })
    const phones = phonesByApartment.get(inv.apartmentId) ?? []
    for (const p of phones) {
      messageInserts.push({
        invoiceId: inv.id,
        phoneNumberId: p.id,
        contents: body,
        templateType: "notification",
        status: "pending",
        createdBy: user.id,
      })
    }
  }

  if (messageInserts.length === 0) {
    return { ok: false, error: "لا توجد أرقام هاتف للإرسال" } as const
  }

  await db.insert(messages).values(messageInserts)

  await db
    .update(batchSessions)
    .set({
      status: "sending",
      updatedBy: user.id,
      updatedAt: now,
      lockedBy: null,
      lockedAt: null,
    })
    .where(eq(batchSessions.id, batchId))

  invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}

export async function resumeSending(input: {
  batchId: number
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const batchRows = await db
    .select({ status: batchSessions.status })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير موجودة" } as const
  }
  if (batchRows[0].status !== "sending") {
    return { ok: false, error: "الدفعة ليست قيد الإرسال" } as const
  }

  const pendingRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.batchId, batchId),
        eq(messages.status, "pending"),
        isNull(invoices.deletedAt),
        isNull(messages.deletedAt)
      )
    )
  if (pendingRows[0]?.count === 0) {
    return { ok: false, error: "لا توجد رسائل بانتظار الإرسال" } as const
  }

  await db
    .update(batchSessions)
    .set({ updatedBy: user.id, updatedAt: now })
    .where(eq(batchSessions.id, batchId))

  invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}

export async function retryFailed(input: {
  batchId: number
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const batchRows = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير مكتملة" } as const
  }

  const failedRows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.batchId, batchId),
        eq(messages.status, "failed"),
        isNull(invoices.deletedAt),
        isNull(messages.deletedAt)
      )
    )

  if (failedRows.length === 0) {
    return { ok: false, error: "لا توجد رسائل فاشلة" } as const
  }

  await db
    .update(messages)
    .set({ status: "pending", errorReason: null, updatedAt: now })
    .where(
      inArray(
        messages.id,
        failedRows.map((m) => m.id)
      )
    )

  await db
    .update(batchSessions)
    .set({ status: "sending", updatedBy: user.id, updatedAt: now })
    .where(eq(batchSessions.id, batchId))

  invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}

export async function sendWarning(input: {
  batchId: number
  invoiceIds: number[]
  amounts?: Record<number, number>
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  const invoiceIds = (input as { invoiceIds?: unknown }).invoiceIds
  const amounts = (input as { amounts?: unknown }).amounts
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  if (
    !Array.isArray(invoiceIds) ||
    !invoiceIds.every((id) => typeof id === "number")
  ) {
    throw new Error("معرّفات الفواتير مطلوبة")
  }
  if (
    amounts !== undefined &&
    (typeof amounts !== "object" || amounts === null)
  ) {
    throw new Error("المبالغ غير صالحة")
  }
  const user = await requireRoleRateLimited("operator")

  const batchRows = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير مكتملة" } as const
  }

  if (invoiceIds.length === 0) {
    return { ok: false, error: "لم يتم اختيار فواتير" } as const
  }

  let invoiceRows = await db
    .select({
      id: invoices.id,
      apartmentId: invoices.apartmentId,
      total: invoices.total,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.batchId, batchId),
        inArray(invoices.id, invoiceIds),
        isNull(invoices.deletedAt)
      )
    )

  if (invoiceRows.length === 0) {
    return { ok: false, error: "الفواتير غير موجودة" } as const
  }

  const existingWarnings = await db
    .select({ invoiceId: messages.invoiceId })
    .from(messages)
    .where(
      and(
        inArray(messages.invoiceId, invoiceIds),
        eq(messages.templateType, "warning"),
        isNull(messages.deletedAt)
      )
    )
  if (existingWarnings.length > 0) {
    const alreadyWarned = new Set(existingWarnings.map((w) => w.invoiceId))
    const validInvoices = invoiceRows.filter((i) => !alreadyWarned.has(i.id))
    if (validInvoices.length === 0) {
      return {
        ok: false,
        error: "تم إرسال تحذيرات لهذه الفواتير بالفعل",
      } as const
    }
    invoiceRows = validInvoices
  }

  const amountMap = new Map<number, number>()
  if (amounts !== undefined && amounts !== null) {
    for (const id of invoiceIds) {
      const raw = (amounts as Record<string, unknown>)[String(id)]
      if (raw === undefined) continue
      const validation = validateInvoiceTotal(raw)
      if (!validation.ok) {
        return { ok: false, error: validation.error } as const
      }
      amountMap.set(id, validation.value)
    }
  }

  for (const inv of invoiceRows) {
    const next = amountMap.get(inv.id)
    if (next !== undefined && next !== inv.total) {
      await db
        .update(invoices)
        .set({ total: next, updatedBy: user.id, updatedAt: now })
        .where(eq(invoices.id, inv.id))
      inv.total = next
    }
  }

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const { phonesByApartment } = await resolveRecipients(apartmentIds)

  const aptLabelRows = await db
    .select({ id: apartments.id, label: apartments.label })
    .from(apartments)
    .where(inArray(apartments.id, apartmentIds))
  const apartmentLabels = new Map(aptLabelRows.map((a) => [a.id, a.label]))

  const messageInserts: Array<{
    invoiceId: number
    phoneNumberId: number
    contents: string
    templateType: "warning"
    status: "pending"
    createdBy: number
  }> = []
  for (const inv of invoiceRows) {
    const label = apartmentLabels.get(inv.apartmentId) ?? ""
    const body = renderWarning({ amount: inv.total, unit_label: label })
    const phones = phonesByApartment.get(inv.apartmentId) ?? []
    for (const p of phones) {
      messageInserts.push({
        invoiceId: inv.id,
        phoneNumberId: p.id,
        contents: body,
        templateType: "warning",
        status: "pending",
        createdBy: user.id,
      })
    }
  }

  if (messageInserts.length === 0) {
    return { ok: false, error: "لا توجد أرقام هاتف للإرسال" } as const
  }

  await db.insert(messages).values(messageInserts)

  await db
    .update(batchSessions)
    .set({ status: "sending", updatedBy: user.id, updatedAt: now })
    .where(eq(batchSessions.id, batchId))

  invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}
