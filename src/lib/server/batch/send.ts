"use server"
import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm"
import { chunk, mapChunks } from "@/lib/chunk"
import {
  requireRoleRateLimited,
  parseBatchIdInput,
} from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import type { BatchStatus } from "@/lib/server/schema/batch-sessions"
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

const NOT_A_DRAFT = "الدفعة غير موجودة أو ليست مسودة"
const NOT_COMPLETED = "الدفعة غير مكتملة"
const ALREADY_WARNED = "تم إرسال تحذيرات لهذه الفواتير بالفعل"
const BUSY_RETRIES = 25
const INSERT_CHUNK = 500
const IN_LIST_CHUNK = 500

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type NewMessage = typeof messages.$inferInsert
type ActionResult = { ok: true; batchId: number } | { ok: false; error: string }

class Rollback extends Error {}

// Local file databases fail fast with SQLITE_BUSY instead of queueing writers.
function isBusy(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    if ("code" in e && e.code === "SQLITE_BUSY") return true
  }
  return false
}

async function atomically(
  work: (tx: Tx) => Promise<ActionResult>
): Promise<ActionResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(work)
    } catch (err) {
      if (err instanceof Rollback) return { ok: false, error: err.message }
      if (!isBusy(err) || attempt >= BUSY_RETRIES) throw err
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt))
    }
  }
}

async function claimBatch(
  tx: Tx,
  batchId: number,
  from: BatchStatus,
  set: Partial<typeof batchSessions.$inferInsert>
): Promise<boolean> {
  const claimed = await tx
    .update(batchSessions)
    .set({ ...set, status: "sending", updatedAt: now })
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, from),
        isNull(batchSessions.deletedAt)
      )
    )
    .returning({ id: batchSessions.id })
  return claimed.length > 0
}

function fetchApartmentLabels(apartmentIds: number[]) {
  return mapChunks(apartmentIds, IN_LIST_CHUNK, (part) =>
    db
      .select({ id: apartments.id, label: apartments.label })
      .from(apartments)
      .where(inArray(apartments.id, part))
  )
}

async function insertMessages(tx: Tx, rows: NewMessage[]): Promise<void> {
  for (const part of chunk(rows, INSERT_CHUNK)) {
    await tx.insert(messages).values(part)
  }
}

async function insertWarnings(
  tx: Tx,
  rows: NewMessage[]
): Promise<Set<number>> {
  const inserted = new Set<number>()
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const created = await tx
      .insert(messages)
      .values(part)
      .onConflictDoNothing()
      .returning({ invoiceId: messages.invoiceId })
    for (const row of created) inserted.add(row.invoiceId)
  }
  return inserted
}

export async function sendBatch(input: {
  batchId: number
}): Promise<ActionResult> {
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
    return { ok: false, error: NOT_A_DRAFT } as const
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
  const aptLabelRows = await fetchApartmentLabels(apartmentIds)
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

  const messageInserts: NewMessage[] = []
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

  const result = await atomically(async (tx) => {
    const claimed = await claimBatch(tx, batchId, "draft", {
      updatedBy: user.id,
      lockedBy: null,
      lockedAt: null,
    })
    if (!claimed) throw new Rollback(NOT_A_DRAFT)
    await insertMessages(tx, messageInserts)
    return { ok: true, batchId } as const
  })

  if (result.ok) await invokeBackgroundProcess(batchId)
  return result
}

export async function resumeSending(input: {
  batchId: number
}): Promise<ActionResult> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const claimed = await db
    .update(batchSessions)
    .set({ updatedBy: user.id, updatedAt: now })
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "sending"),
        isNull(batchSessions.deletedAt),
        exists(
          db
            .select({ one: sql`1` })
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
        )
      )
    )
    .returning({ id: batchSessions.id })

  if (claimed.length === 0) {
    const [batch] = await db
      .select({ status: batchSessions.status })
      .from(batchSessions)
      .where(
        and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt))
      )
      .limit(1)
    if (!batch) return { ok: false, error: "الدفعة غير موجودة" } as const
    if (batch.status !== "sending") {
      return { ok: false, error: "الدفعة ليست قيد الإرسال" } as const
    }
    return { ok: false, error: "لا توجد رسائل بانتظار الإرسال" } as const
  }

  await invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}

export async function retryFailed(input: {
  batchId: number
}): Promise<ActionResult> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const result = await atomically(async (tx) => {
    const claimed = await claimBatch(tx, batchId, "completed", {
      updatedBy: user.id,
    })
    if (!claimed) throw new Rollback("الدفعة غير مكتملة")

    const flipped = await tx
      .update(messages)
      .set({ status: "pending", errorReason: null, updatedAt: now })
      .where(
        and(
          eq(messages.status, "failed"),
          isNull(messages.deletedAt),
          inArray(
            messages.invoiceId,
            tx
              .select({ id: invoices.id })
              .from(invoices)
              .where(
                and(eq(invoices.batchId, batchId), isNull(invoices.deletedAt))
              )
          )
        )
      )
      .returning({ id: messages.id })
    if (flipped.length === 0) throw new Rollback("لا توجد رسائل فاشلة")

    return { ok: true, batchId } as const
  })

  if (result.ok) await invokeBackgroundProcess(batchId)
  return result
}

export async function sendWarning(input: {
  batchId: number
  invoiceIds: number[]
  amounts?: Record<number, number>
}): Promise<ActionResult> {
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
    return { ok: false, error: NOT_COMPLETED } as const
  }

  if (invoiceIds.length === 0) {
    return { ok: false, error: "لم يتم اختيار فواتير" } as const
  }

  let invoiceRows = await mapChunks(invoiceIds, IN_LIST_CHUNK, (part) =>
    db
      .select({
        id: invoices.id,
        apartmentId: invoices.apartmentId,
        total: invoices.total,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.batchId, batchId),
          inArray(invoices.id, part),
          isNull(invoices.deletedAt)
        )
      )
  )

  if (invoiceRows.length === 0) {
    return { ok: false, error: "الفواتير غير موجودة" } as const
  }

  const existingWarnings = await mapChunks(invoiceIds, IN_LIST_CHUNK, (part) =>
    db
      .select({ invoiceId: messages.invoiceId })
      .from(messages)
      .where(
        and(
          inArray(messages.invoiceId, part),
          eq(messages.templateType, "warning"),
          isNull(messages.deletedAt)
        )
      )
  )
  if (existingWarnings.length > 0) {
    const alreadyWarned = new Set(existingWarnings.map((w) => w.invoiceId))
    const validInvoices = invoiceRows.filter((i) => !alreadyWarned.has(i.id))
    if (validInvoices.length === 0) {
      return {
        ok: false,
        error: ALREADY_WARNED,
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

  const totalChanges = new Map<number, number>()
  for (const inv of invoiceRows) {
    const next = amountMap.get(inv.id)
    if (next !== undefined && next !== inv.total) {
      totalChanges.set(inv.id, next)
      inv.total = next
    }
  }

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const { phonesByApartment } = await resolveRecipients(apartmentIds)

  const aptLabelRows = await fetchApartmentLabels(apartmentIds)
  const apartmentLabels = new Map(aptLabelRows.map((a) => [a.id, a.label]))

  const messageInserts: NewMessage[] = []
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

  const result = await atomically(async (tx) => {
    const claimed = await claimBatch(tx, batchId, "completed", {
      updatedBy: user.id,
    })
    if (!claimed) throw new Rollback(NOT_COMPLETED)

    const warned = await insertWarnings(tx, messageInserts)
    if (warned.size === 0) throw new Rollback(ALREADY_WARNED)

    for (const [invoiceId, total] of totalChanges) {
      if (!warned.has(invoiceId)) continue
      await tx
        .update(invoices)
        .set({ total, updatedBy: user.id, updatedAt: now })
        .where(eq(invoices.id, invoiceId))
    }
    return { ok: true, batchId } as const
  })

  if (result.ok) await invokeBackgroundProcess(batchId)
  return result
}
