"use server"
import { and, eq, isNull, lt, or } from "drizzle-orm"
import { requireRole } from "@/lib/server/auth-helpers"
import {
  requireRoleRateLimited,
  parseBatchIdInput,
} from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { batchSessions, users } from "@/lib/server/schema"
import { formatSqliteUtc, LOCK_TIMEOUT_SECONDS } from "./lock-time"

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
  const cutoff = formatSqliteUtc(
    new Date(Date.now() - LOCK_TIMEOUT_SECONDS * 1000)
  )

  const acquired = await db
    .update(batchSessions)
    .set({ lockedBy: user.id, lockedAt: formatSqliteUtc(new Date()) })
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "draft"),
        eq(batchSessions.mode, "manual"),
        isNull(batchSessions.deletedAt),
        or(
          isNull(batchSessions.lockedBy),
          eq(batchSessions.lockedBy, user.id),
          isNull(batchSessions.lockedAt),
          lt(batchSessions.lockedAt, cutoff)
        )
      )
    )
    .returning({ id: batchSessions.id })
  if (acquired.length > 0) return { ok: true }

  const [batch] = await db
    .select({
      status: batchSessions.status,
      mode: batchSessions.mode,
      lockedBy: batchSessions.lockedBy,
      lockedAt: batchSessions.lockedAt,
    })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)
  const unlocked: BatchLockInfo = {
    lockedBy: null,
    lockedAt: null,
    lockedByName: null,
  }
  if (!batch) {
    return { ok: false, error: "الدفعة غير موجودة", lockedBy: unlocked }
  }
  if (batch.status !== "draft") {
    return { ok: false, error: "الدفعة ليست مسودة", lockedBy: unlocked }
  }
  if (batch.mode !== "manual") {
    return {
      ok: false,
      error: "القفل ينطبق على الدفعات اليدوية فقط",
      lockedBy: unlocked,
    }
  }
  return {
    ok: false,
    error: "الدفعة مقفلة بواسطة مستخدم آخر",
    lockedBy: {
      lockedBy: batch.lockedBy,
      lockedAt: batch.lockedAt,
      lockedByName:
        batch.lockedBy === null ? null : await getUserName(batch.lockedBy),
    },
  }
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
    .set({ lockedAt: formatSqliteUtc(new Date()) })
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
