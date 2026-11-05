import { randomUUID } from "node:crypto"

import {
  and,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { dispatchBatchProcessing } from "@/lib/server/batch/dispatch"
import type { DispatchResult } from "@/lib/server/batch/dispatch"
import { AdaptiveConcurrency } from "@/lib/server/batch/adaptive-concurrency"
import {
  acquireLease,
  formatLeaseTime,
  leaseTtlMs,
  releaseLease,
  renewLease,
} from "@/lib/server/batch/lease"
import { db as defaultDb, type DB } from "@/lib/server/db"
import { invoices, messages, phoneNumbers } from "@/lib/server/schema"
import { getSmsGateway, type SmsGateway } from "@/lib/server/sms-gateway"

const UNCERTAIN = "حالة الإرسال غير مؤكدة"
const STUCK_REASON = `${UNCERTAIN}: انتهت مهلة معالجة الرسالة دون رد`
const MISSING_PHONE = "رقم الهاتف غير موجود"

const DEFAULT_BUDGET_MS = 12 * 60_000
const DEFAULT_MAX_HOPS = 100
const DEFAULT_CLAIM_TIMEOUT_MS = 120_000
const MIN_ENV_CLAIM_TIMEOUT_MS = 60_000
const DEFAULT_LEASE_RENEW_MS = 30_000
const DEFAULT_COUNTER_EVERY_MESSAGES = 100
const DEFAULT_COUNTER_EVERY_MS = 5_000
const DEFAULT_RETRY_BASE_MS = 500
const MAX_PRE_SEND_RETRIES = 2
const PAGE_SIZE = 200
const ID_CHUNK = 500

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function claimTimeoutMs(): number {
  return Math.max(
    intEnv("CLAIM_TIMEOUT_MS", DEFAULT_CLAIM_TIMEOUT_MS),
    MIN_ENV_CLAIM_TIMEOUT_MS
  )
}

export interface ProcessOptions {
  db?: DB
  gateway?: SmsGateway
  budgetMs?: number
  hop?: number
  maxHops?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  dispatch?: (
    batchId: number,
    opts: { hop: number }
  ) => Promise<DispatchResult>
  runnerId?: string
  concurrency?: number
  concurrencyMax?: number
  counterEveryMessages?: number
  counterEveryMs?: number
  leaseTtlMs?: number
  leaseRenewMs?: number
  claimTimeoutMs?: number
  retryBaseMs?: number
}

export type ProcessOutcome =
  | "completed"
  | "chained"
  | "chain_failed"
  | "hop_cap"
  | "lease_unavailable"
  | "lease_lost"
  | "pending_left"

export interface ProcessResult {
  outcome: ProcessOutcome
  processed: number
}

const stamp = (ms: number) => formatLeaseTime(ms)

const liveMessages = (batchId: number) =>
  and(
    eq(invoices.batchId, batchId),
    isNull(invoices.deletedAt),
    isNull(messages.deletedAt)
  )

export async function refreshBatchCounters(
  batchId: number,
  db: DB = defaultDb,
  nowMs: number = Date.now()
): Promise<void> {
  const ts = stamp(nowMs)
  await db.run(sql`
    WITH c AS MATERIALIZED (
      SELECT m.status AS status, count(*) AS n
      FROM messages m
      JOIN invoices i ON i.id = m.invoice_id
      WHERE i.batch_id = ${batchId}
        AND i.deleted_at IS NULL
        AND m.deleted_at IS NULL
      GROUP BY m.status
    )
    UPDATE batch_sessions SET
      sent = COALESCE((SELECT n FROM c WHERE status = 'sent'), 0),
      failed = COALESCE((SELECT n FROM c WHERE status = 'failed'), 0),
      unknown = COALESCE((SELECT n FROM c WHERE status = 'unknown'), 0),
      status = CASE
        WHEN COALESCE((SELECT sum(n) FROM c WHERE status IN ('pending', 'sending')), 0) = 0
        THEN 'completed' ELSE 'sending' END,
      updated_at = ${ts}
    WHERE id = ${batchId} AND status IN ('sending', 'completed')
  `)
}

export async function reapStuckMessages(
  batchId: number | undefined,
  olderThanMs: number,
  deps: { db?: DB; now?: () => number } = {}
): Promise<number> {
  const db = deps.db ?? defaultDb
  const nowMs = (deps.now ?? Date.now)()
  const cutoff = stamp(nowMs - olderThanMs)
  const scope: SQL | undefined =
    batchId === undefined
      ? undefined
      : inArray(
          messages.invoiceId,
          db
            .select({ id: invoices.id })
            .from(invoices)
            .where(eq(invoices.batchId, batchId))
        )
  const reaped = await db
    .update(messages)
    .set({ status: "unknown", errorReason: STUCK_REASON, updatedAt: stamp(nowMs) })
    .where(
      and(
        eq(messages.status, "sending"),
        or(isNull(messages.claimedAt), lt(messages.claimedAt, cutoff)),
        scope
      )
    )
    .returning({ invoiceId: messages.invoiceId })

  if (reaped.length === 0) return 0
  const invoiceIds = [...new Set(reaped.map((r) => r.invoiceId))]
  const batchIds = new Set<number>()
  for (let i = 0; i < invoiceIds.length; i += ID_CHUNK) {
    const rows = await db
      .select({ batchId: invoices.batchId })
      .from(invoices)
      .where(inArray(invoices.id, invoiceIds.slice(i, i + ID_CHUNK)))
    for (const r of rows) batchIds.add(r.batchId)
  }
  for (const id of batchIds) await refreshBatchCounters(id, db, nowMs)
  return reaped.length
}

interface PendingRow {
  id: number
  contents: string
  clientRef: string | null
  number: string | null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const withUncertain = (reason: string) =>
  reason.includes(UNCERTAIN) ? reason : `${UNCERTAIN}: ${reason}`

export async function processPendingMessages(
  batchId: number,
  o: ProcessOptions = {}
): Promise<ProcessResult> {
  const db = o.db ?? defaultDb
  const now = o.now ?? Date.now
  const runnerId = o.runnerId ?? randomUUID()
  const ttl = o.leaseTtlMs ?? leaseTtlMs()
  const hop = o.hop ?? 0
  const maxHops = o.maxHops ?? intEnv("CHAIN_MAX_HOPS", DEFAULT_MAX_HOPS)
  const budgetMs =
    o.budgetMs ?? intEnv("PROCESS_TIME_BUDGET_MS", DEFAULT_BUDGET_MS)

  if (!(await acquireLease(batchId, runnerId, ttl, { db, now }))) {
    console.warn(
      `[processPendingMessages] batch ${batchId} is leased by another runner, exiting`
    )
    return { outcome: "lease_unavailable", processed: 0 }
  }

  const startedAt = now()
  const budgetOut = () => now() - startedAt >= budgetMs
  let run: { processed: number; leaseLost: boolean }
  try {
    run = await runLoop(batchId, o, { db, now, runnerId, ttl, budgetOut })
  } finally {
    await releaseLease(batchId, runnerId, { db, now }).catch((err) =>
      console.error(`[processPendingMessages] release failed`, err)
    )
  }

  if (run.leaseLost) return { outcome: "lease_lost", processed: run.processed }
  const remaining = await countPending(db, batchId)
  if (remaining === 0) return { outcome: "completed", processed: run.processed }
  if (!budgetOut()) return { outcome: "pending_left", processed: run.processed }

  if (hop >= maxHops) {
    console.error(
      `[processPendingMessages] batch ${batchId} reached the hop cap (${maxHops}) with ${remaining} pending; the watchdog will resume it`
    )
    return { outcome: "hop_cap", processed: run.processed }
  }
  const dispatch = o.dispatch ?? dispatchBatchProcessing
  try {
    const res = await dispatch(batchId, { hop: hop + 1 })
    if (res.ok) return { outcome: "chained", processed: run.processed }
    console.error(
      `[processPendingMessages] batch ${batchId} continuation dispatch failed: ${res.error ?? res.status}; the watchdog will resume it`
    )
  } catch (err) {
    console.error(
      `[processPendingMessages] batch ${batchId} continuation dispatch threw`,
      err
    )
  }
  return { outcome: "chain_failed", processed: run.processed }
}

async function countPending(db: DB, batchId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(liveMessages(batchId), eq(messages.status, "pending")))
  return row?.n ?? 0
}

interface RunContext {
  db: DB
  now: () => number
  runnerId: string
  ttl: number
  budgetOut: () => boolean
}

async function runLoop(
  batchId: number,
  o: ProcessOptions,
  ctx: RunContext
): Promise<{ processed: number; leaseLost: boolean }> {
  const { db, now, runnerId, ttl, budgetOut } = ctx
  const gateway = o.gateway ?? getSmsGateway()
  const sleep =
    o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const random = o.random ?? Math.random
  const renewEvery = o.leaseRenewMs ?? DEFAULT_LEASE_RENEW_MS
  const refreshEveryMessages =
    o.counterEveryMessages ?? DEFAULT_COUNTER_EVERY_MESSAGES
  const refreshEveryMs = o.counterEveryMs ?? DEFAULT_COUNTER_EVERY_MS
  const retryBase = o.retryBaseMs ?? DEFAULT_RETRY_BASE_MS

  await reapStuckMessages(batchId, o.claimTimeoutMs ?? claimTimeoutMs(), {
    db,
    now,
  })

  const concurrency = new AdaptiveConcurrency({
    initial: o.concurrency ?? intEnv("SEND_CONCURRENCY", 10),
    max: o.concurrencyMax ?? intEnv("SEND_CONCURRENCY_MAX", 20),
  })

  let processed = 0
  let leaseLost = false
  let fatal: { error: unknown } | undefined
  let lastRenew = now()
  let lastRefresh = now()
  let sinceRefresh = 0
  const handled = new Set<number>()
  let buffer: PendingRow[] = []
  let exhausted = false

  const stopped = () => leaseLost || fatal !== undefined || budgetOut()

  const fetchPage = () =>
    db
      .select({
        id: messages.id,
        contents: messages.contents,
        clientRef: messages.clientRef,
        number: phoneNumbers.number,
      })
      .from(messages)
      .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
      .leftJoin(phoneNumbers, eq(messages.phoneNumberId, phoneNumbers.id))
      .where(and(liveMessages(batchId), eq(messages.status, "pending")))
      .orderBy(messages.id)
      .limit(PAGE_SIZE)

  async function nextRow(): Promise<PendingRow | undefined> {
    if (buffer.length === 0 && !exhausted) {
      buffer = (await fetchPage()).filter((r) => !handled.has(r.id))
      if (buffer.length === 0) exhausted = true
    }
    const row = buffer.shift()
    if (row) handled.add(row.id)
    return row
  }

  async function claim(id: number) {
    const ts = stamp(now())
    const [row] = await db
      .update(messages)
      .set({
        status: "sending",
        claimedAt: ts,
        attempts: sql`${messages.attempts} + 1`,
        updatedAt: ts,
      })
      .where(
        and(
          eq(messages.id, id),
          eq(messages.status, "pending"),
          isNull(messages.deletedAt)
        )
      )
      .returning({ id: messages.id, partsSent: messages.partsSent })
    return row
  }

  const settle = (id: number, set: Partial<typeof messages.$inferInsert>) =>
    db
      .update(messages)
      .set({ ...set, updatedAt: stamp(now()) })
      .where(
        and(eq(messages.id, id), inArray(messages.status, ["sending", "unknown"]))
      )

  async function handle(row: PendingRow): Promise<void> {
    const claimed = await claim(row.id)
    if (!claimed) return
    let partsSent = claimed.partsSent

    if (!row.number) {
      await settle(row.id, { status: "failed", errorReason: MISSING_PHONE })
    } else {
      let attempt = 0
      for (;;) {
        const startedAt = now()
        let result
        try {
          result = await gateway.send(row.number, row.contents, {
            startPart: partsSent > 0 ? partsSent + 1 : undefined,
            clientRef: row.clientRef ?? undefined,
          })
        } catch (err) {
          concurrency.record({ latencyMs: now() - startedAt, ambiguous: true })
          await settle(row.id, {
            status: "unknown",
            errorReason: withUncertain(errorMessage(err)),
            partsSent,
          })
          break
        }
        concurrency.record({
          latencyMs: now() - startedAt,
          ambiguous: !result.ok && result.outcome === "ambiguous",
        })

        if (result.ok) {
          await settle(row.id, {
            status: "sent",
            sentAt: stamp(now()),
            gatewayMessageId: result.messageId || null,
            errorReason: null,
          })
          break
        }
        partsSent = result.partsSent ?? partsSent
        if (result.outcome === "ambiguous") {
          await settle(row.id, {
            status: "unknown",
            errorReason: withUncertain(result.error),
            partsSent,
          })
          break
        }
        if (result.preSend && attempt < MAX_PRE_SEND_RETRIES) {
          attempt++
          await sleep(Math.round(retryBase * 2 ** (attempt - 1) * (0.5 + random())))
          const ts = stamp(now())
          await db
            .update(messages)
            .set({
              claimedAt: ts,
              attempts: sql`${messages.attempts} + 1`,
              partsSent,
              updatedAt: ts,
            })
            .where(and(eq(messages.id, row.id), eq(messages.status, "sending")))
          continue
        }
        await settle(row.id, {
          status: "failed",
          errorReason: result.error,
          partsSent,
        })
        break
      }
    }
    processed++
    sinceRefresh++
  }

  async function maybeRenewAndRefresh(): Promise<void> {
    if (now() - lastRenew >= renewEvery) {
      lastRenew = now()
      if (!(await renewLease(batchId, runnerId, ttl, { db, now })))
        leaseLost = true
    }
    if (
      sinceRefresh >= refreshEveryMessages ||
      (sinceRefresh > 0 && now() - lastRefresh >= refreshEveryMs)
    ) {
      sinceRefresh = 0
      lastRefresh = now()
      await refreshBatchCounters(batchId, db, now()).catch((err) =>
        console.error(`[processPendingMessages] counter refresh failed`, err)
      )
    }
  }

  async function pool(): Promise<void> {
    const inFlight = new Set<Promise<void>>()
    for (;;) {
      while (!stopped() && inFlight.size < concurrency.limit) {
        const row = await nextRow()
        if (!row) break
        const task: Promise<void> = handle(row)
          .catch((error: unknown) => {
            fatal ??= { error }
          })
          .finally(() => inFlight.delete(task))
        inFlight.add(task)
      }
      if (inFlight.size === 0) return
      await Promise.race(inFlight)
      await maybeRenewAndRefresh()
    }
  }

  let progressed = true
  while (progressed && !stopped()) {
    const before = processed
    handled.clear()
    buffer = []
    exhausted = false
    await pool()
    progressed = processed > before && (await countPending(db, batchId)) > 0
  }

  if (fatal) {
    await refreshBatchCounters(batchId, db, now()).catch(() => {})
    console.error(`[processPendingMessages] batch ${batchId} failed`, fatal.error)
    throw fatal.error
  }
  await refreshBatchCounters(batchId, db, now())
  return { processed, leaseLost }
}
