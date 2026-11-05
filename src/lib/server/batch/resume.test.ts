import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestDb, type TestDb } from "@/test/db"
import { seedBatch } from "@/test/engine"
import { createMessage } from "@/test/fixtures"
import { batchSessions, messages } from "@/lib/server/schema"

import type { DispatchResult } from "./dispatch"
import { acquireLease } from "./lease"
import { resumeStalledBatches } from "./resume"

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

let t: TestDb
let clock: number
let dispatch: ReturnType<typeof makeDispatch>

const makeDispatch = () =>
  vi.fn(
    async (_id: number, _o: { hop: number }): Promise<DispatchResult> => ({
      ok: true,
      status: 202,
    })
  )

const run = (over: Partial<Record<string, unknown>> = {}) =>
  resumeStalledBatches({
    db: t.db,
    now: () => clock,
    dispatch,
    claimTimeoutMs: 120_000,
    ...over,
  })

const dispatchedIds = () => dispatch.mock.calls.map((c) => c[0])

beforeEach(async () => {
  t = await createTestDb()
  clock = T0
  dispatch = makeDispatch()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(async () => {
  await t.cleanup()
})

describe("resumeStalledBatches", () => {
  it("dispatches a sending batch with pending messages and no lease, starting at hop 0", async () => {
    const a = await seedBatch(t.db, 3)
    const res = await run()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(a.batchId, { hop: 0 })
    expect(res.dispatched).toEqual([a.batchId])
  })

  it("dispatches when the lease has expired", async () => {
    const a = await seedBatch(t.db, 3)
    await acquireLease(a.batchId, "dead", 1_000, {
      db: t.db,
      now: () => clock - 600_000,
    })
    await run()
    expect(dispatchedIds()).toEqual([a.batchId])
  })

  it("skips a batch whose lease is still live", async () => {
    const a = await seedBatch(t.db, 3)
    await acquireLease(a.batchId, "alive", 120_000, {
      db: t.db,
      now: () => clock,
    })
    const res = await run()
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.dispatched).toEqual([])
  })

  it("ignores completed, draft, deleted and pending-free batches", async () => {
    await seedBatch(t.db, 2, { batchStatus: "completed" })
    await seedBatch(t.db, 2, { batchStatus: "draft" })
    const deleted = await seedBatch(t.db, 2)
    await t.db
      .update(batchSessions)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(batchSessions.id, deleted.batchId))
    await seedBatch(t.db, 2, { messageStatus: "sent" })
    await run()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("ignores pending messages that are soft-deleted", async () => {
    const a = await seedBatch(t.db, 1)
    await t.db
      .update(messages)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(messages.id, a.messageIds[0] as number))
    await run()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("reaps stuck sending messages before looking for batches", async () => {
    const a = await seedBatch(t.db, 1)
    const stuck = await createMessage(t.db, {
      invoiceId: a.invoiceId,
      status: "sending",
      claimedAt: "2026-01-01 11:00:00",
    })
    const fresh = await createMessage(t.db, {
      invoiceId: a.invoiceId,
      status: "sending",
      claimedAt: "2026-01-01 11:59:30",
    })
    const res = await run()
    expect(res.reaped).toBe(1)
    const [s] = await t.db.select().from(messages).where(eq(messages.id, stuck.id))
    const [f] = await t.db.select().from(messages).where(eq(messages.id, fresh.id))
    expect(s?.status).toBe("unknown")
    expect(f?.status).toBe("sending")
    expect(dispatchedIds()).toEqual([a.batchId])
  })

  it("a batch with only stuck sending rows is completed by the reaper and not dispatched", async () => {
    const a = await seedBatch(t.db, 0)
    await createMessage(t.db, {
      invoiceId: a.invoiceId,
      status: "sending",
      claimedAt: "2026-01-01 11:00:00",
    })
    await run()
    const [b] = await t.db
      .select()
      .from(batchSessions)
      .where(eq(batchSessions.id, a.batchId))
    expect(b).toMatchObject({ status: "completed", unknown: 1 })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("respects the per-tick maximum (default 5)", async () => {
    for (let i = 0; i < 8; i++) await seedBatch(t.db, 1)
    const res = await run()
    expect(dispatch).toHaveBeenCalledTimes(5)
    expect(res.dispatched).toHaveLength(5)
    dispatch.mockClear()
    await run({ maxPerTick: 2 })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it("keeps going and reports when one dispatch fails or throws", async () => {
    const a = await seedBatch(t.db, 1)
    const b = await seedBatch(t.db, 1)
    const c = await seedBatch(t.db, 1)
    dispatch.mockImplementation(async (id: number) => {
      if (id === a.batchId) return { ok: false, status: 500, error: "x" }
      if (id === b.batchId) throw new Error("net")
      return { ok: true, status: 202 }
    })
    const res = await run()
    expect(dispatch).toHaveBeenCalledTimes(3)
    expect(res.dispatched).toEqual([c.batchId])
    expect(res.failed.map((f) => f.batchId).sort()).toEqual(
      [a.batchId, b.batchId].sort()
    )
  })

  it("does no sending and does not touch pending messages", async () => {
    const a = await seedBatch(t.db, 4)
    await run()
    const rows = await t.db
      .select({ status: messages.status })
      .from(messages)
      .where(eq(messages.invoiceId, a.invoiceId))
    expect(rows.every((r) => r.status === "pending")).toBe(true)
  })
})

describe("resume-batches-scheduled wrapper", () => {
  it("is scheduled every 2 minutes and delegates to resumeStalledBatches", async () => {
    const resume = vi.fn(async () => ({
      reaped: 0,
      dispatched: [],
      failed: [],
    }))
    vi.resetModules()
    vi.doMock("./resume", () => ({ resumeStalledBatches: resume }))
    const mod = await import(
      "../../../../netlify/functions/resume-batches-scheduled"
    )
    expect(mod.config.schedule).toBe("*/2 * * * *")
    await mod.default(new Request("https://x.test", { method: "POST" }))
    expect(resume).toHaveBeenCalledTimes(1)
    vi.doUnmock("./resume")
  })
})
