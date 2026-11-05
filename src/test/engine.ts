import { and, eq, sql } from "drizzle-orm"

import type { DB } from "@/lib/server/db"
import type { BatchStatus, MessageStatus } from "@/lib/server/schema"
import { invoices, messages, phoneNumbers } from "@/lib/server/schema"
import type { SmsGateway, SmsResult } from "@/lib/server/sms-gateway"

import { createBatch, createContact, createInvoice, createUser } from "./fixtures"

const CHUNK = 500

export interface SeededBatch {
  batchId: number
  invoiceId: number
  messageIds: number[]
  numbers: string[]
}

export async function seedBatch(
  db: DB,
  count: number,
  opts: {
    batchStatus?: BatchStatus
    messageStatus?: MessageStatus
    claimedAt?: string | null
    prefix?: string
  } = {}
): Promise<SeededBatch> {
  const user = await createUser(db)
  const batch = await createBatch(db, {
    status: opts.batchStatus ?? "sending",
    createdBy: user.id,
  })
  const invoice = await createInvoice(db, {
    batchId: batch.id,
    createdBy: user.id,
  })
  const contact = await createContact(db, { createdBy: user.id })
  const prefix = opts.prefix ?? `${batch.id}`
  const numbers = Array.from(
    { length: count },
    (_, i) => `${prefix}-${String(i).padStart(6, "0")}`
  )

  const phoneIds: number[] = []
  for (let i = 0; i < numbers.length; i += CHUNK) {
    const rows = await db
      .insert(phoneNumbers)
      .values(
        numbers.slice(i, i + CHUNK).map((number) => ({
          number,
          contactId: contact.id,
          createdBy: user.id,
        }))
      )
      .returning({ id: phoneNumbers.id })
    phoneIds.push(...rows.map((r) => r.id))
  }

  const messageIds: number[] = []
  for (let i = 0; i < phoneIds.length; i += CHUNK) {
    const rows = await db
      .insert(messages)
      .values(
        phoneIds.slice(i, i + CHUNK).map((phoneNumberId, j) => ({
          invoiceId: invoice.id,
          phoneNumberId,
          contents: `body ${i + j}`,
          templateType: "notification" as const,
          status: opts.messageStatus ?? "pending",
          claimedAt: opts.claimedAt ?? null,
          createdBy: user.id,
        }))
      )
      .returning({ id: messages.id })
    messageIds.push(...rows.map((r) => r.id))
  }
  return { batchId: batch.id, invoiceId: invoice.id, messageIds, numbers }
}

export async function statusCounts(
  db: DB,
  batchId: number
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: messages.status, n: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(eq(invoices.batchId, batchId)))
    .groupBy(messages.status)
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

export function okGateway(): SmsGateway & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    send: async (to): Promise<SmsResult> => {
      calls.push(to)
      return { ok: true, messageId: `id-${to}` }
    },
  }
}
