import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/server/db"
import { batchSessions } from "@/lib/server/schema"
import { formatSqliteUtc, LOCK_TIMEOUT_SECONDS } from "./lock-time"

export type LockCheck = { ok: true } | { ok: false; error: string }

export function isLockExpired(
  lockedAt: string | null,
  now: Date = new Date()
): boolean {
  if (lockedAt === null) return true
  const cutoff = formatSqliteUtc(
    new Date(now.getTime() - LOCK_TIMEOUT_SECONDS * 1000)
  )
  return lockedAt < cutoff
}

export async function checkLockHeld(
  batchId: number,
  userId: number
): Promise<LockCheck> {
  const [batch] = await db
    .select({
      mode: batchSessions.mode,
      lockedBy: batchSessions.lockedBy,
      lockedAt: batchSessions.lockedAt,
    })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)
  if (!batch) return { ok: false, error: "الدفعة غير موجودة" }
  if (batch.mode !== "manual") return { ok: true }

  const live = batch.lockedBy !== null && !isLockExpired(batch.lockedAt)
  if (live && batch.lockedBy === userId) return { ok: true }
  if (live) return { ok: false, error: "الدفعة مقفلة بواسطة مستخدم آخر" }
  return { ok: false, error: "يجب الحصول على قفل الدفعة أولاً" }
}

export async function assertLockHeld(
  batchId: number,
  userId: number
): Promise<void> {
  const check = await checkLockHeld(batchId, userId)
  if (!check.ok) throw new Error(check.error)
}
