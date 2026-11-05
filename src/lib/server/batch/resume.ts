import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm"

import { claimTimeoutMs, reapStuckMessages } from "@/lib/server/batch-processing"
import { db as defaultDb, type DB } from "@/lib/server/db"
import { batchSessions } from "@/lib/server/schema"

import { dispatchBatchProcessing, type DispatchResult } from "./dispatch"
import { formatLeaseTime } from "./lease"

const DEFAULT_MAX_PER_TICK = 5

export interface ResumeDeps {
  db?: DB
  now?: () => number
  dispatch?: (
    batchId: number,
    opts: { hop: number }
  ) => Promise<DispatchResult>
  maxPerTick?: number
  claimTimeoutMs?: number
}

export interface ResumeResult {
  reaped: number
  dispatched: number[]
  failed: Array<{ batchId: number; error: string }>
}

export async function resumeStalledBatches(
  deps: ResumeDeps = {}
): Promise<ResumeResult> {
  const db = deps.db ?? defaultDb
  const now = deps.now ?? Date.now
  const dispatch = deps.dispatch ?? dispatchBatchProcessing

  const reaped = await reapStuckMessages(
    undefined,
    deps.claimTimeoutMs ?? claimTimeoutMs(),
    { db, now }
  )

  const candidates = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.status, "sending"),
        isNull(batchSessions.deletedAt),
        or(
          isNull(batchSessions.runnerLeaseUntil),
          lt(batchSessions.runnerLeaseUntil, formatLeaseTime(now()))
        ),
        sql`exists (
          select 1 from messages m
          join invoices i on i.id = m.invoice_id
          where i.batch_id = ${batchSessions.id}
            and i.deleted_at is null
            and m.deleted_at is null
            and m.status = 'pending'
        )`
      )
    )
    .orderBy(asc(batchSessions.id))
    .limit(deps.maxPerTick ?? DEFAULT_MAX_PER_TICK)

  const dispatched: number[] = []
  const failed: ResumeResult["failed"] = []
  await Promise.all(
    candidates.map(async ({ id }) => {
      try {
        const res = await dispatch(id, { hop: 0 })
        if (res.ok) dispatched.push(id)
        else failed.push({ batchId: id, error: res.error ?? `HTTP ${res.status}` })
      } catch (err) {
        failed.push({
          batchId: id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  )
  for (const f of failed)
    console.error(`[resumeStalledBatches] batch ${f.batchId}: ${f.error}`)
  dispatched.sort((a, b) => a - b)
  return { reaped, dispatched, failed }
}
