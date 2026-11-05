import { and, eq, isNull, lt, or } from "drizzle-orm"

import { db as defaultDb, type DB } from "@/lib/server/db"
import { batchSessions } from "@/lib/server/schema"

export const DEFAULT_LEASE_TTL_MS = 120_000

export interface LeaseDeps {
  db?: DB
  now?: () => number
}

export function leaseTtlMs(): number {
  const n = Number(process.env.LEASE_TTL_MS)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LEASE_TTL_MS
}

// Same text format as datetime('now') so lexicographic comparison is valid.
export function formatLeaseTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ")
}

function resolve(deps: LeaseDeps) {
  return { db: deps.db ?? defaultDb, now: deps.now ?? Date.now }
}

// A lease is expired when runner_lease_until < now (second resolution), so it
// is still held during the exact second it expires.
export async function acquireLease(
  batchId: number,
  runnerId: string,
  ttlMs: number,
  deps: LeaseDeps = {}
): Promise<boolean> {
  const { db, now } = resolve(deps)
  const nowText = formatLeaseTime(now())
  const rows = await db
    .update(batchSessions)
    .set({
      runnerId,
      runnerLeaseUntil: formatLeaseTime(now() + ttlMs),
    })
    .where(
      and(
        eq(batchSessions.id, batchId),
        isNull(batchSessions.deletedAt),
        or(
          isNull(batchSessions.runnerLeaseUntil),
          lt(batchSessions.runnerLeaseUntil, nowText),
          eq(batchSessions.runnerId, runnerId)
        )
      )
    )
    .returning({ id: batchSessions.id })
  return rows.length > 0
}

export async function renewLease(
  batchId: number,
  runnerId: string,
  ttlMs: number,
  deps: LeaseDeps = {}
): Promise<boolean> {
  const { db, now } = resolve(deps)
  const rows = await db
    .update(batchSessions)
    .set({ runnerLeaseUntil: formatLeaseTime(now() + ttlMs) })
    .where(
      and(eq(batchSessions.id, batchId), eq(batchSessions.runnerId, runnerId))
    )
    .returning({ id: batchSessions.id })
  return rows.length > 0
}

export async function releaseLease(
  batchId: number,
  runnerId: string,
  deps: LeaseDeps = {}
): Promise<boolean> {
  const { db } = resolve(deps)
  const rows = await db
    .update(batchSessions)
    .set({ runnerId: null, runnerLeaseUntil: null })
    .where(
      and(eq(batchSessions.id, batchId), eq(batchSessions.runnerId, runnerId))
    )
    .returning({ id: batchSessions.id })
  return rows.length > 0
}
