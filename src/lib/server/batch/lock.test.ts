import type { AsyncLocalStorage } from "node:async_hooks"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SessionUser } from "@/auth.config"
import { batchSessions } from "@/lib/server/schema"
import { runConcurrently } from "@/test/concurrency"
import { createTestDb, type TestDb } from "@/test/db"
import { createBatch, createUser } from "@/test/fixtures"
import { formatSqliteUtc, LOCK_TIMEOUT_SECONDS } from "./lock-time"

const holder = vi.hoisted(() => ({
  db: null as unknown,
  current: null as unknown,
  als: null as unknown,
}))

vi.mock("@/lib/server/db", () => ({
  get db() {
    return holder.db
  },
}))

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  mutationLimiter: null,
}))

vi.mock("@/lib/server/auth-helpers", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks")
  const als = new AsyncLocalStorage<SessionUser>()
  holder.als = als
  return {
    requireRole: async (role: "operator" | "admin"): Promise<SessionUser> => {
      const user = als.getStore() ?? (holder.current as SessionUser | null)
      if (!user) throw new Error("غير مصرح: يجب تسجيل الدخول")
      if (role === "admin" && !user.isAdmin)
        throw new Error("غير مصرح: هذه العملية تتطلب صلاحيات المسؤول")
      return user
    },
  }
})

const {
  acquireBatchLock,
  releaseBatchLock,
  heartbeatBatchLock,
  forceReleaseBatchLock,
} = await import("./lock")

let testDb: TestDb

function asUser(user: SessionUser): void {
  holder.current = user
}

function sessionUser(
  row: { id: number; fullname: string },
  isAdmin = false
): SessionUser {
  return {
    id: row.id,
    fullname: row.fullname,
    username: `u${row.id}`,
    isAdmin,
    mustResetPassword: false,
  }
}

async function setLockedAt(batchId: number, lockedAt: string | null) {
  await testDb.db
    .update(batchSessions)
    .set({ lockedAt })
    .where(eq(batchSessions.id, batchId))
}

async function readBatch(batchId: number) {
  const [row] = await testDb.db
    .select()
    .from(batchSessions)
    .where(eq(batchSessions.id, batchId))
  return row
}

const ago = (seconds: number) =>
  formatSqliteUtc(new Date(Date.now() - seconds * 1000))

function lockedBatch(lockedBy: number, lockedAt: string) {
  return createBatch(testDb.db, { mode: "manual", lockedBy, lockedAt })
}

beforeEach(async () => {
  testDb = await createTestDb()
  holder.db = testDb.db
})

afterEach(async () => {
  vi.useRealTimers()
  await testDb.cleanup()
})

describe("lock expiry (B7)", () => {
  it("lets another user acquire a lock that is 10 minutes old", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, { mode: "manual" })
    await testDb.client.execute({
      sql: "update batch_sessions set locked_by = ?, locked_at = datetime('now', '-10 minutes') where id = ?",
      args: [a.id, batch.id],
    })
    asUser(sessionUser(b))

    const result = await acquireBatchLock({ batchId: batch.id })

    expect(result).toEqual({ ok: true })
    expect((await readBatch(batch.id)).lockedBy).toBe(b.id)
  })

  it("refuses another user while the lock is 1 minute old", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, { mode: "manual" })
    await testDb.client.execute({
      sql: "update batch_sessions set locked_by = ?, locked_at = datetime('now', '-1 minutes') where id = ?",
      args: [a.id, batch.id],
    })
    asUser(sessionUser(b))

    const result = await acquireBatchLock({ batchId: batch.id })

    expect(result.ok).toBe(false)
    expect((await readBatch(batch.id)).lockedBy).toBe(a.id)
  })

  it("treats a lock exactly at the timeout as live and one second older as expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const batch = await lockedBatch(a.id, ago(LOCK_TIMEOUT_SECONDS))
    asUser(sessionUser(b))

    const atBoundary = await acquireBatchLock({ batchId: batch.id })
    expect(atBoundary.ok).toBe(false)

    await setLockedAt(batch.id, ago(LOCK_TIMEOUT_SECONDS + 1))
    const pastBoundary = await acquireBatchLock({ batchId: batch.id })
    expect(pastBoundary).toEqual({ ok: true })
  })

  it("treats a lock with no timestamp as free", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, {
      mode: "manual",
      lockedBy: a.id,
    })
    asUser(sessionUser(b))

    expect(await acquireBatchLock({ batchId: batch.id })).toEqual({ ok: true })
  })
})

describe("acquireBatchLock", () => {
  it("acquires an unlocked draft manual batch", async () => {
    const u = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, { mode: "manual" })
    asUser(sessionUser(u))

    expect(await acquireBatchLock({ batchId: batch.id })).toEqual({ ok: true })
    const row = await readBatch(batch.id)
    expect(row.lockedBy).toBe(u.id)
    expect(row.lockedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it("exactly one of two concurrent acquires wins and the loser sees the winner", async () => {
    const a = await createUser(testDb.db, { fullname: "Alice" })
    const b = await createUser(testDb.db, { fullname: "Bob" })
    const batch = await createBatch(testDb.db, { mode: "manual" })
    const als = holder.als as AsyncLocalStorage<SessionUser>
    const users = [sessionUser(a), sessionUser(b)]

    const settled = await runConcurrently(
      users.map(
        (u) => () => als.run(u, () => acquireBatchLock({ batchId: batch.id }))
      )
    )

    const results = settled.map((s) => {
      if (s.status !== "fulfilled") throw s.reason
      return s.value
    })
    const winnerIndex = results.findIndex((r) => r.ok)
    const losers = results.filter((r) => !r.ok)
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(losers).toHaveLength(1)
    const loser = losers[0]
    if (loser.ok) throw new Error("unreachable")
    expect(loser.error).toBe("الدفعة مقفلة بواسطة مستخدم آخر")
    expect(loser.lockedBy.lockedBy).toBe(users[winnerIndex].id)
    expect(loser.lockedBy.lockedByName).toBe(
      winnerIndex === 0 ? "Alice" : "Bob"
    )
    expect((await readBatch(batch.id)).lockedBy).toBe(users[winnerIndex].id)
  })

  it("lets the holder refresh its own lock", async () => {
    const u = await createUser(testDb.db)
    const old = ago(120)
    const batch = await lockedBatch(u.id, old)
    asUser(sessionUser(u))

    expect(await acquireBatchLock({ batchId: batch.id })).toEqual({ ok: true })
    expect((await readBatch(batch.id)).lockedAt! > old).toBe(true)
  })

  it("reports the holder's name when locked by another user", async () => {
    const a = await createUser(testDb.db, { fullname: "Other User" })
    const b = await createUser(testDb.db)
    const lockedAt = ago(30)
    const batch = await lockedBatch(a.id, lockedAt)
    asUser(sessionUser(b))

    expect(await acquireBatchLock({ batchId: batch.id })).toEqual({
      ok: false,
      error: "الدفعة مقفلة بواسطة مستخدم آخر",
      lockedBy: { lockedBy: a.id, lockedAt, lockedByName: "Other User" },
    })
  })

  it("refuses a missing batch", async () => {
    asUser(sessionUser(await createUser(testDb.db)))
    const result = await acquireBatchLock({ batchId: 9999 })
    expect(result).toMatchObject({ ok: false, error: "الدفعة غير موجودة" })
  })

  it("refuses a soft-deleted batch as not found", async () => {
    const u = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, {
      mode: "manual",
      deletedAt: "2026-01-01 00:00:00",
    })
    asUser(sessionUser(u))
    const result = await acquireBatchLock({ batchId: batch.id })
    expect(result).toMatchObject({ ok: false, error: "الدفعة غير موجودة" })
    expect((await readBatch(batch.id)).lockedBy).toBeNull()
  })

  it("refuses a non-draft batch", async () => {
    const u = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, {
      mode: "manual",
      status: "sending",
    })
    asUser(sessionUser(u))
    const result = await acquireBatchLock({ batchId: batch.id })
    expect(result).toMatchObject({ ok: false, error: "الدفعة ليست مسودة" })
    expect((await readBatch(batch.id)).lockedBy).toBeNull()
  })

  it("refuses an automatic-mode batch", async () => {
    const u = await createUser(testDb.db)
    const batch = await createBatch(testDb.db, { mode: "automatic" })
    asUser(sessionUser(u))
    const result = await acquireBatchLock({ batchId: batch.id })
    expect(result).toMatchObject({
      ok: false,
      error: "القفل ينطبق على الدفعات اليدوية فقط",
    })
    expect((await readBatch(batch.id)).lockedBy).toBeNull()
  })
})

describe("releaseBatchLock", () => {
  it("releases when the caller holds the lock", async () => {
    const u = await createUser(testDb.db)
    const batch = await lockedBatch(u.id, ago(10))
    asUser(sessionUser(u))
    expect(await releaseBatchLock({ batchId: batch.id })).toEqual({ ok: true })
    const row = await readBatch(batch.id)
    expect(row.lockedBy).toBeNull()
    expect(row.lockedAt).toBeNull()
  })

  it("rejects a non-holder and keeps the lock", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const batch = await lockedBatch(a.id, ago(10))
    asUser(sessionUser(b))
    expect(await releaseBatchLock({ batchId: batch.id })).toEqual({
      ok: false,
      error: "لا تملك قفل هذه الدفعة",
    })
    expect((await readBatch(batch.id)).lockedBy).toBe(a.id)
  })
})

describe("heartbeatBatchLock", () => {
  it("refreshes locked_at for the holder", async () => {
    const u = await createUser(testDb.db)
    const old = ago(200)
    const batch = await lockedBatch(u.id, old)
    asUser(sessionUser(u))
    expect(await heartbeatBatchLock({ batchId: batch.id })).toEqual({
      ok: true,
    })
    expect((await readBatch(batch.id)).lockedAt! > old).toBe(true)
  })

  it("rejects a non-holder and leaves locked_at untouched", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const old = ago(200)
    const batch = await lockedBatch(a.id, old)
    asUser(sessionUser(b))
    expect(await heartbeatBatchLock({ batchId: batch.id })).toEqual({
      ok: false,
      error: "لا تملك قفل هذه الدفعة",
    })
    expect((await readBatch(batch.id)).lockedAt).toBe(old)
  })

  it("rejects a former holder after another user took over an expired lock", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db)
    const batch = await lockedBatch(a.id, ago(LOCK_TIMEOUT_SECONDS + 60))
    asUser(sessionUser(b))
    expect(await acquireBatchLock({ batchId: batch.id })).toEqual({ ok: true })
    asUser(sessionUser(a))
    expect(await heartbeatBatchLock({ batchId: batch.id })).toEqual({
      ok: false,
      error: "لا تملك قفل هذه الدفعة",
    })
    expect((await readBatch(batch.id)).lockedBy).toBe(b.id)
  })
})

describe("forceReleaseBatchLock", () => {
  it("lets an admin release anyone's lock", async () => {
    const a = await createUser(testDb.db)
    const admin = await createUser(testDb.db)
    const batch = await lockedBatch(a.id, ago(10))
    asUser(sessionUser(admin, true))
    expect(await forceReleaseBatchLock({ batchId: batch.id })).toEqual({
      ok: true,
    })
    expect((await readBatch(batch.id)).lockedBy).toBeNull()
  })

  it("rejects an operator", async () => {
    const a = await createUser(testDb.db)
    const op = await createUser(testDb.db)
    const batch = await lockedBatch(a.id, ago(10))
    asUser(sessionUser(op))
    await expect(forceReleaseBatchLock({ batchId: batch.id })).rejects.toThrow()
    expect((await readBatch(batch.id)).lockedBy).toBe(a.id)
  })

  it("reports a missing batch", async () => {
    asUser(sessionUser(await createUser(testDb.db), true))
    expect(await forceReleaseBatchLock({ batchId: 9999 })).toEqual({
      ok: false,
      error: "الدفعة غير موجودة",
    })
  })
})
