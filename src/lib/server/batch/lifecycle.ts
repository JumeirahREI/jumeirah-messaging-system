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
  return db.transaction(async (tx) => {
    const rows = await tx
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
      const [batch] = await tx
        .select({ status: batchSessions.status })
        .from(batchSessions)
        .where(and(eq(batchSessions.id, id), isNull(batchSessions.deletedAt)))
      return {
        ok: false,
        error:
          batch?.status === "sending"
            ? "لا يمكن حذف الدفعة أثناء الإرسال"
            : "لا يمكن حذف الدفعة (غير موجودة أو ليست مسودة)",
      } as const
    }
    const invoiceIds = tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.batchId, id), isNull(invoices.deletedAt)))
    await tx
      .update(messages)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(
        and(inArray(messages.invoiceId, invoiceIds), isNull(messages.deletedAt))
      )
    await tx
      .update(invoices)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(eq(invoices.batchId, id), isNull(invoices.deletedAt)))
    return { ok: true, data: rows[0] } as const
  })
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
