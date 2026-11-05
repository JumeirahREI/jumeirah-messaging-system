import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { batchSessions } from "@/lib/server/schema"
import {
  authHelpersModule,
  operatorUser,
  resetAuth,
  setTestUser,
} from "@/test/auth"
import { createTestDb, type TestDb } from "@/test/db"
import { createBatch, createInvoice, createUser } from "@/test/fixtures"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/server/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("@/lib/server/auth-helpers", () => authHelpersModule())
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  mutationLimiter: null,
}))

const { softDeleteBatch, archiveBatch } = await import("./lifecycle")

let testDb: TestDb

beforeEach(async () => {
  testDb = await createTestDb()
  holder.db = testDb.db
  const user = await createUser(testDb.db)
  setTestUser(operatorUser({ id: user.id }))
})

afterEach(async () => {
  resetAuth()
  await testDb.cleanup()
})

async function deletedAt(id: number) {
  const [r] = await testDb.db
    .select()
    .from(batchSessions)
    .where(eq(batchSessions.id, id))
  return r.deletedAt
}

describe("softDeleteBatch", () => {
  it("is rejected while the batch is sending", async () => {
    const batch = await createBatch(testDb.db, { status: "sending" })

    const result = await softDeleteBatch({ id: batch.id })

    expect(result.ok).toBe(false)
    expect(await deletedAt(batch.id)).toBeNull()
  })

  it("deletes a draft batch and its invoices", async () => {
    const batch = await createBatch(testDb.db, { status: "draft" })
    const invoice = await createInvoice(testDb.db, { batchId: batch.id })

    const result = await softDeleteBatch({ id: batch.id })

    expect(result).toEqual({ ok: true, data: { id: batch.id } })
    expect(await deletedAt(batch.id)).not.toBeNull()
    const res = await testDb.client.execute({
      sql: "SELECT deleted_at FROM invoices WHERE id = ?",
      args: [invoice.id],
    })
    expect(res.rows[0].deleted_at).not.toBeNull()
  })

  it("deletes a completed batch", async () => {
    const batch = await createBatch(testDb.db, { status: "completed" })

    const result = await softDeleteBatch({ id: batch.id })

    expect(result.ok).toBe(true)
    expect(await deletedAt(batch.id)).not.toBeNull()
  })

  it("keeps archiving completed batches only", async () => {
    const done = await createBatch(testDb.db, { status: "completed" })
    const sending = await createBatch(testDb.db, { status: "sending" })

    expect((await archiveBatch({ id: done.id })).ok).toBe(true)
    expect((await archiveBatch({ id: sending.id })).ok).toBe(false)
  })
})
