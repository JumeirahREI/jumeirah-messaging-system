"use server"
import { and, eq, inArray, isNull } from "drizzle-orm"
import {
  requireRoleRateLimited,
  parseIdInput,
} from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { batchSessions, invoices, messages } from "@/lib/server/schema"
import { now } from "./shared"

export async function softDeleteBatch(input: {
  id: number
}): Promise<{ ok: true; data: { id: number } } | { ok: false; error: string }> {
  const id = parseIdInput(input)
  const user = await requireRoleRateLimited("operator")
  const rows = await db
    .update(batchSessions)
    .set({
      deletedBy: user.id,
      deletedAt: now,
      lockedBy: null,
      lockedAt: null,
    })
    .where(
      and(
        eq(batchSessions.id, id),
        eq(batchSessions.status, "draft"),
        isNull(batchSessions.deletedAt)
      )
    )
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return {
      ok: false,
      error: "لا يمكن حذف الدفعة (غير موجودة أو ليست مسودة)",
    } as const
  }
  const invoiceIds = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.batchId, id), isNull(invoices.deletedAt)))

  if (invoiceIds.length > 0) {
    const ids = invoiceIds.map((i) => i.id)
    await db
      .update(messages)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(inArray(messages.invoiceId, ids), isNull(messages.deletedAt)))
    await db
      .update(invoices)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(inArray(invoices.id, ids), isNull(invoices.deletedAt)))
  }
  return { ok: true, data: rows[0] } as const
}

export async function archiveBatch(input: {
  id: number
}): Promise<{ ok: true; data: { id: number } } | { ok: false; error: string }> {
  const id = parseIdInput(input)
  const user = await requireRoleRateLimited("operator")
  const rows = await db
    .update(batchSessions)
    .set({ archivedAt: now, updatedBy: user.id, updatedAt: now })
    .where(
      and(
        eq(batchSessions.id, id),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt),
        isNull(batchSessions.archivedAt)
      )
    )
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return {
      ok: false,
      error: "لا يمكن أرشفة الدفعة (غير موجودة أو ليست مكتملة)",
    } as const
  }
  return { ok: true, data: rows[0] } as const
}
