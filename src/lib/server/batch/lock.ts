"use server"
import { and, eq, isNull, sql } from "drizzle-orm"
import { requireRole } from "@/lib/server/auth-helpers"
import {
  requireRoleRateLimited,
  parseBatchIdInput,
} from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { batchSessions, users } from "@/lib/server/schema"
import { now } from "./shared"

const LOCK_TIMEOUT_SECONDS = 5 * 60

export type BatchLockInfo = {
  lockedBy: number | null
  lockedAt: string | null
  lockedByName: string | null
}

export async function acquireBatchLock(input: {
  batchId: number
}): Promise<
  { ok: true } | { ok: false; error: string; lockedBy: BatchLockInfo }
> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const batchRows = await db
    .select({
      id: batchSessions.id,
      status: batchSessions.status,
      mode: batchSessions.mode,
      lockedBy: batchSessions.lockedBy,
      lockedAt: batchSessions.lockedAt,
    })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)
  if (batchRows.length === 0) {
    return {
      ok: false,
      error: "الدفعة غير موجودة",
      lockedBy: { lockedBy: null, lockedAt: null, lockedByName: null },
    }
  }
  const batch = batchRows[0]
  if (batch.status !== "draft") {
    return {
      ok: false,
      error: "الدفعة ليست مسودة",
      lockedBy: { lockedBy: null, lockedAt: null, lockedByName: null },
    }
  }
  if (batch.mode !== "manual") {
    return {
      ok: false,
      error: "القفل ينطبق على الدفعات اليدوية فقط",
      lockedBy: { lockedBy: null, lockedAt: null, lockedByName: null },
    }
  }

  const expiredRows = await db
    .select({
      id: batchSessions.id,
      lockedBy: batchSessions.lockedBy,
      lockedAt: batchSessions.lockedAt,
    })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        sql`${batchSessions.lockedAt} is not null`,
        sql`${batchSessions.lockedAt} < datetime('now', '-${LOCK_TIMEOUT_SECONDS} seconds')`
      )
    )
    .limit(1)
  const isExpired = expiredRows.length > 0

  if (batch.lockedBy !== null && batch.lockedBy !== user.id && !isExpired) {
    const lockerName = await getUserName(batch.lockedBy)
    return {
      ok: false,
      error: "الدفعة مقفلة بواسطة مستخدم آخر",
      lockedBy: {
        lockedBy: batch.lockedBy,
        lockedAt: batch.lockedAt,
        lockedByName: lockerName,
      },
    }
  }

  await db
    .update(batchSessions)
    .set({ lockedBy: user.id, lockedAt: now })
    .where(eq(batchSessions.id, batchId))

  return { ok: true }
}

export async function releaseBatchLock(input: {
  batchId: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRoleRateLimited("operator")

  const rows = await db
    .update(batchSessions)
    .set({ lockedBy: null, lockedAt: null })
    .where(
      and(eq(batchSessions.id, batchId), eq(batchSessions.lockedBy, user.id))
    )
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return { ok: false, error: "لا تملك قفل هذه الدفعة" }
  }
  return { ok: true }
}

export async function heartbeatBatchLock(input: {
  batchId: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const batchId = parseBatchIdInput(input)
  const user = await requireRole("operator")

  const rows = await db
    .update(batchSessions)
    .set({ lockedAt: now })
    .where(
      and(eq(batchSessions.id, batchId), eq(batchSessions.lockedBy, user.id))
    )
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return { ok: false, error: "لا تملك قفل هذه الدفعة" }
  }
  return { ok: true }
}

export async function forceReleaseBatchLock(input: {
  batchId: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const batchId = parseBatchIdInput(input)
  await requireRoleRateLimited("admin")

  const rows = await db
    .update(batchSessions)
    .set({ lockedBy: null, lockedAt: null })
    .where(eq(batchSessions.id, batchId))
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return { ok: false, error: "الدفعة غير موجودة" }
  }
  return { ok: true }
}

async function getUserName(userId: number): Promise<string | null> {
  const rows = await db
    .select({ name: users.fullname })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows.length > 0 ? rows[0].name : null
}
