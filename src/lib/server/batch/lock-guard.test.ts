import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { batchSessions } from "@/lib/server/schema"
import { createTestDb, type TestDb } from "@/test/db"
import { createBatch, createUser } from "@/test/fixtures"
import { formatSqliteUtc, LOCK_TIMEOUT_SECONDS } from "./lock-time"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/server/db", () => ({
  get db() {
    return holder.db
  },
}))

const { assertLockHeld, checkLockHeld, isLockExpired } = await import(
  "./lock-guard"
)

let testDb: TestDb

const ago = (seconds: number) =>
  formatSqliteUtc(new Date(Date.now() - seconds * 1000))

const NOT_HELD = "يجب الحصول على قفل الدفعة أولاً"
const HELD_BY_OTHER = "الدفعة مقفلة بواسطة مستخدم آخر"
const NOT_FOUND = "الدفعة غير موجودة"

beforeEach(async () => {
  testDb = await createTestDb()
  holder.db = testDb.db
})

afterEach(async () => {
  await testDb.cleanup()
})

describe("isLockExpired", () => {
  const now = new Date("2026-06-01T12:00:00Z")
  const at = (seconds: number) =>
    formatSqliteUtc(new Date(now.getTime() - seconds * 1000))

  it("treats a missing timestamp as expired", () => {
    expect(isLockExpired(null, now)).toBe(true)
  })

  it("is live at exactly the timeout and expired one second later", () => {
    expect(isLockExpired(at(LOCK_TIMEOUT_SECONDS), now)).toBe(false)
    expect(isLockExpired(at(LOCK_TIMEOUT_SECONDS + 1), now)).toBe(true)
    expect(isLockExpired(at(1), now)).toBe(false)
  })

  it("defaults now to the current time", () => {
    expect(isLockExpired(ago(10))).toBe(false)
    expect(isLockExpired(ago(LOCK_TIMEOUT_SECONDS + 60))).toBe(true)
  })
})

describe("checkLockHeld / assertLockHeld", () => {
  it("accepts the holder of a live lock", async () => {
    const u = await createUser(testDb.db)
    const b = await createBatch(testDb.db, {
      mode: "manual",
      lockedBy: u.id,
      lockedAt: ago(30),
    })
    expect(await checkLockHeld(b.id, u.id)).toEqual({ ok: true })
    await expect(assertLockHeld(b.id, u.id)).resolves.toBeUndefined()
  })

  it("rejects another user while the lock is live", async () => {
    const a = await createUser(testDb.db)
    const other = await createUser(testDb.db)
    const b = await createBatch(testDb.db, {
      mode: "manual",
      lockedBy: a.id,
      lockedAt: ago(30),
    })
    expect(await checkLockHeld(b.id, other.id)).toEqual({
      ok: false,
      error: HELD_BY_OTHER,
    })
    await expect(assertLockHeld(b.id, other.id)).rejects.toThrow(HELD_BY_OTHER)
  })

  it("rejects when nobody holds the lock", async () => {
    const u = await createUser(testDb.db)
    const b = await createBatch(testDb.db, { mode: "manual" })
    expect(await checkLockHeld(b.id, u.id)).toEqual({
      ok: false,
      error: NOT_HELD,
    })
    await expect(assertLockHeld(b.id, u.id)).rejects.toThrow(NOT_HELD)
  })

  it("rejects an expired lock even when held by the same user", async () => {
    const u = await createUser(testDb.db)
    const b = await createBatch(testDb.db, {
      mode: "manual",
      lockedBy: u.id,
      lockedAt: ago(LOCK_TIMEOUT_SECONDS + 60),
    })
    expect(await checkLockHeld(b.id, u.id)).toEqual({
      ok: false,
      error: NOT_HELD,
    })
  })

  it("treats an expired lock held by someone else as not held", async () => {
    const a = await createUser(testDb.db)
    const u = await createUser(testDb.db)
    const b = await createBatch(testDb.db, {
      mode: "manual",
      lockedBy: a.id,
      lockedAt: ago(LOCK_TIMEOUT_SECONDS + 60),
    })
    expect(await checkLockHeld(b.id, u.id)).toEqual({
      ok: false,
      error: NOT_HELD,
    })
  })

  it("is a no-op for automatic batches", async () => {
    const u = await createUser(testDb.db)
    const b = await createBatch(testDb.db, { mode: "automatic" })
    expect(await checkLockHeld(b.id, u.id)).toEqual({ ok: true })
    await expect(assertLockHeld(b.id, u.id)).resolves.toBeUndefined()
  })

  it("errors for unknown and soft-deleted batches", async () => {
    const u = await createUser(testDb.db)
    const b = await createBatch(testDb.db, { mode: "manual" })
    await testDb.db
      .update(batchSessions)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(batchSessions.id, b.id))
    for (const id of [9999, b.id]) {
      expect(await checkLockHeld(id, u.id)).toEqual({
        ok: false,
        error: NOT_FOUND,
      })
      await expect(assertLockHeld(id, u.id)).rejects.toThrow(NOT_FOUND)
    }
  })
})
