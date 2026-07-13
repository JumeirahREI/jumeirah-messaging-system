import { and, eq, inArray, isNull, sql } from "drizzle-orm"

import { db } from "@/lib/server/db"
import type { BatchStatus } from "@/lib/server/schema"
import {
  batchSessions,
  invoices,
  messages,
  phoneNumbers,
} from "@/lib/server/schema"
import { getSmsGateway } from "@/lib/server/sms-gateway"

const now = sql`(datetime('now'))`

const SEND_CONCURRENCY = 5

export async function refreshBatchCounters(batchId: number): Promise<void> {
  const countRows = await db
    .select({ status: messages.status, count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.batchId, batchId),
        isNull(invoices.deletedAt),
        isNull(messages.deletedAt)
      )
    )
    .groupBy(messages.status)

  let sent = 0
  let failed = 0
  let pending = 0
  for (const row of countRows) {
    if (row.status === "sent") sent = row.count
    else if (row.status === "failed") failed = row.count
    else pending = row.count
  }

  const status: BatchStatus = pending === 0 ? "completed" : "sending"
  await db
    .update(batchSessions)
    .set({ sent, failed, status, updatedAt: now })
    .where(eq(batchSessions.id, batchId))
}

export async function processPendingMessages(batchId: number): Promise<void> {
  const gateway = getSmsGateway()

  const pendingRows = await db
    .select({
      id: messages.id,
      phoneNumberId: messages.phoneNumberId,
      contents: messages.contents,
    })
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

  if (pendingRows.length === 0) {
    await refreshBatchCounters(batchId)
    return
  }

  const phoneIds = pendingRows.map((m) => m.phoneNumberId)
  const phoneRows = await db
    .select({ id: phoneNumbers.id, number: phoneNumbers.number })
    .from(phoneNumbers)
    .where(inArray(phoneNumbers.id, phoneIds))
  const phoneMap = new Map(phoneRows.map((p) => [p.id, p.number]))

  for (let i = 0; i < pendingRows.length; i += SEND_CONCURRENCY) {
    const chunk = pendingRows.slice(i, i + SEND_CONCURRENCY)
    await Promise.all(chunk.map((m) => sendOne(gateway, phoneMap, m)))
  }

  await refreshBatchCounters(batchId)
}

async function sendOne(
  gateway: ReturnType<typeof getSmsGateway>,
  phoneMap: Map<number, string>,
  row: { id: number; phoneNumberId: number; contents: string }
): Promise<void> {
  const to = phoneMap.get(row.phoneNumberId) ?? ""
  if (!to) {
    await db
      .update(messages)
      .set({
        status: "failed",
        errorReason: "رقم الهاتف غير موجود",
        updatedAt: now,
      })
      .where(eq(messages.id, row.id))
    return
  }

  const result = await gateway.send(to, row.contents)
  if (result.ok) {
    await db
      .update(messages)
      .set({ status: "sent", sentAt: now, updatedAt: now })
      .where(eq(messages.id, row.id))
  } else {
    await db
      .update(messages)
      .set({ status: "failed", errorReason: result.error, updatedAt: now })
      .where(eq(messages.id, row.id))
  }
}
