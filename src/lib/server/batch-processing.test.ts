import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createGate, runConcurrently } from "@/test/concurrency"
import { createTestDb, type TestDb } from "@/test/db"
import { okGateway, seedBatch, statusCounts } from "@/test/engine"
import { createMessage } from "@/test/fixtures"
import { behaviors, ScriptedSmsGateway } from "@/test/sms"
import type { DispatchResult } from "@/lib/server/batch/dispatch"
import type { DB } from "@/lib/server/db"
import { batchSessions, messages } from "@/lib/server/schema"
import type { SmsGateway, SmsResult } from "@/lib/server/sms-gateway"

import {
  processPendingMessages,
  reapStuckMessages,
  refreshBatchCounters,
  type ProcessOptions,
} from "./batch-processing"
import { acquireLease } from "./batch/lease"

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const UNCERTAIN = "حالة الإرسال غير مؤكدة"

let t: TestDb
let clock: number
let dispatch: ReturnType<typeof dispatchOk>

const dispatchOk = () =>
  vi.fn(
    async (_id: number, _o: { hop: number }): Promise<DispatchResult> => ({
      ok: true,
      status: 202,
    })
  )

function opts(over: Partial<ProcessOptions> = {}): ProcessOptions {
  return {
    db: t.db,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    random: () => 0.5,
    dispatch,
    ...over,
  }
}

async function row(id: number) {
  const [r] = await t.db.select().from(messages).where(eq(messages.id, id))
  return r
}

async function batch(id: number) {
  const [r] = await t.db
    .select()
    .from(batchSessions)
    .where(eq(batchSessions.id, id))
  return r
}

function gatewayOf(
  send: (to: string, body: string, o?: { startPart?: number }) => Promise<SmsResult>
): SmsGateway & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    send: async (to, body, o) => {
      calls.push(to)
      return send(to, body, o)
    },
  }
}

beforeEach(async () => {
  t = await createTestDb()
  clock = T0
  dispatch = dispatchOk()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(async () => {
  await t.cleanup()
})

describe("happy path", () => {
  it("sends every pending message once and completes the batch", async () => {
    const seeded = await seedBatch(t.db, 12)
    const gateway = okGateway()
    const res = await processPendingMessages(
      seeded.batchId,
      opts({ gateway })
    )
    expect(res.outcome).toBe("completed")
    expect(gateway.calls.sort()).toEqual([...seeded.numbers].sort())
    const m = await row(seeded.messageIds[0] as number)
    expect(m).toMatchObject({
      status: "sent",
      gatewayMessageId: `id-${seeded.numbers[0]}`,
      attempts: 1,
    })
    expect(m?.sentAt).toBeTruthy()
    expect(await batch(seeded.batchId)).toMatchObject({
      status: "completed",
      sent: 12,
      failed: 0,
      unknown: 0,
      runnerId: null,
      runnerLeaseUntil: null,
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("ignores soft-deleted messages and other batches", async () => {
    const a = await seedBatch(t.db, 3)
    const b = await seedBatch(t.db, 2)
    await t.db
      .update(messages)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(messages.id, a.messageIds[0] as number))
    const gateway = okGateway()
    await processPendingMessages(a.batchId, opts({ gateway }))
    expect(gateway.calls).toHaveLength(2)
    expect((await row(b.messageIds[0] as number))?.status).toBe("pending")
    expect((await row(a.messageIds[0] as number))?.status).toBe("pending")
  })
})

describe("atomic claim and lease", () => {
  it("two concurrent runs send each message exactly once; the second exits on the lease", async () => {
    const seeded = await seedBatch(t.db, 40)
    const gateway = new ScriptedSmsGateway({
      defaultBehavior: behaviors.delay(5),
    })
    const results = await runConcurrently([
      () => processPendingMessages(seeded.batchId, opts({ gateway })),
      () => processPendingMessages(seeded.batchId, opts({ gateway })),
    ])
    const outcomes = results.map((r) =>
      r.status === "fulfilled" ? r.value.outcome : "rejected"
    )
    expect(outcomes.sort()).toEqual(["completed", "lease_unavailable"])
    expect(gateway.calls).toHaveLength(40)
    expect(new Set(gateway.calls.map((c) => c.to)).size).toBe(40)
  })

  it("never re-sends a message already in sending", async () => {
    const seeded = await seedBatch(t.db, 2)
    const stuck = await createMessage(t.db, {
      invoiceId: seeded.invoiceId,
      status: "sending",
      claimedAt: "2026-01-01 11:59:59",
    })
    const gateway = okGateway()
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(gateway.calls).toHaveLength(2)
    expect((await row(stuck.id))?.status).toBe("sending")
    expect((await batch(seeded.batchId))?.status).toBe("sending")
  })

  it("exits immediately without sending when another worker holds a live lease", async () => {
    const seeded = await seedBatch(t.db, 5)
    await acquireLease(seeded.batchId, "other", 120_000, {
      db: t.db,
      now: () => clock,
    })
    const gateway = okGateway()
    const res = await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(res.outcome).toBe("lease_unavailable")
    expect(gateway.calls).toHaveLength(0)
    expect((await batch(seeded.batchId))?.runnerId).toBe("other")
  })

  it("takes over an expired lease", async () => {
    const seeded = await seedBatch(t.db, 3)
    await acquireLease(seeded.batchId, "dead", 1_000, {
      db: t.db,
      now: () => clock - 600_000,
    })
    const gateway = okGateway()
    const res = await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(res.outcome).toBe("completed")
    expect(gateway.calls).toHaveLength(3)
  })

  it("releases the lease when the run throws", async () => {
    const seeded = await seedBatch(t.db, 3)
    const gateway = okGateway()
    const failing = new Proxy(t.db, {
      get(target, prop) {
        if (prop === "run") return () => Promise.reject(new Error("db down"))
        return Reflect.get(target, prop, target)
      },
    }) as DB
    await expect(
      processPendingMessages(seeded.batchId, {
        ...opts({ gateway }),
        db: failing,
      })
    ).rejects.toThrow("db down")
    expect((await batch(seeded.batchId))?.runnerId).toBeNull()
  })

  it("renews the lease during a long run", async () => {
    const seeded = await seedBatch(t.db, 6)
    const seen: Array<string | null> = []
    const gateway = gatewayOf(async () => {
      clock += 20_000
      seen.push((await batch(seeded.batchId))?.runnerLeaseUntil ?? null)
      return { ok: true, messageId: "x" }
    })
    await processPendingMessages(
      seeded.batchId,
      opts({
        gateway,
        concurrency: 1,
        concurrencyMax: 1,
        leaseTtlMs: 60_000,
        leaseRenewMs: 30_000,
      })
    )
    const distinct = new Set(seen)
    expect(distinct.size).toBeGreaterThan(1)
  })
})

describe("outcome handling", () => {
  it("ambiguous becomes unknown, is not retried and keeps the uncertain reason", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.ambiguous("socket hang up")],
    })
    const sleep = vi.fn(async () => {})
    await processPendingMessages(seeded.batchId, opts({ gateway, sleep }))
    const m = await row(seeded.messageIds[0] as number)
    expect(m?.status).toBe("unknown")
    expect(m?.errorReason).toContain(UNCERTAIN)
    expect(m?.errorReason).toContain("socket hang up")
    expect(gateway.calls).toHaveLength(1)
    expect(sleep).not.toHaveBeenCalled()
    expect(await batch(seeded.batchId)).toMatchObject({
      status: "completed",
      unknown: 1,
      failed: 0,
      sent: 0,
    })
  })

  it("a provider failure becomes failed with the provider reason and is not retried", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.failure("Invalid Login")],
    })
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    const m = await row(seeded.messageIds[0] as number)
    expect(m).toMatchObject({ status: "failed", errorReason: "Invalid Login" })
    expect(gateway.calls).toHaveLength(1)
    expect((await batch(seeded.batchId))?.failed).toBe(1)
  })

  it("retries a pre-send failure at most twice with growing backoff, then fails", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      defaultBehavior: behaviors.failure("refused", { preSend: true }),
    })
    const delays: number[] = []
    await processPendingMessages(
      seeded.batchId,
      opts({
        gateway,
        sleep: async (ms) => {
          delays.push(ms)
        },
      })
    )
    expect(gateway.calls).toHaveLength(3)
    expect(delays).toHaveLength(2)
    expect(delays[1]).toBeGreaterThan(delays[0] as number)
    expect(await row(seeded.messageIds[0] as number)).toMatchObject({
      status: "failed",
      errorReason: "refused",
      attempts: 3,
    })
  })

  it("a pre-send failure that later succeeds ends sent", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      script: [
        behaviors.failure("refused", { preSend: true }),
        behaviors.success("ok-2"),
      ],
    })
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(await row(seeded.messageIds[0] as number)).toMatchObject({
      status: "sent",
      gatewayMessageId: "ok-2",
    })
    expect(gateway.calls).toHaveLength(2)
  })

  it("a retry that turns ambiguous ends unknown without further retries", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      script: [
        behaviors.failure("refused", { preSend: true }),
        behaviors.ambiguous("timeout"),
      ],
      defaultBehavior: behaviors.success(),
    })
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect((await row(seeded.messageIds[0] as number))?.status).toBe("unknown")
    expect(gateway.calls).toHaveLength(2)
  })

  it("a throwing gateway leaves the message unknown, never failed, and does not stop others", async () => {
    const seeded = await seedBatch(t.db, 3)
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.throwing("kaboom")],
    })
    await processPendingMessages(
      seeded.batchId,
      opts({ gateway, concurrency: 1, concurrencyMax: 1 })
    )
    expect(await statusCounts(t.db, seeded.batchId)).toEqual({
      unknown: 1,
      sent: 2,
    })
  })
})

describe("multipart", () => {
  it("stores parts_sent from a partial failure", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.ambiguous("timeout", { partsSent: 1 })],
    })
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(await row(seeded.messageIds[0] as number)).toMatchObject({
      status: "unknown",
      partsSent: 1,
    })
  })

  it("a deliberate retry resumes at the next part", async () => {
    const seeded = await seedBatch(t.db, 1)
    const id = seeded.messageIds[0] as number
    await t.db
      .update(messages)
      .set({ status: "pending", partsSent: 1 })
      .where(eq(messages.id, id))
    const gateway = new ScriptedSmsGateway()
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(gateway.calls[0]?.startPart).toBe(2)
    expect((await row(id))?.status).toBe("sent")
  })

  it("an automatic pre-send retry also resumes after delivered parts", async () => {
    const seeded = await seedBatch(t.db, 1)
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.failure("refused", { preSend: true, partsSent: 1 })],
    })
    await processPendingMessages(seeded.batchId, opts({ gateway }))
    expect(gateway.calls[0]?.startPart).toBeUndefined()
    expect(gateway.calls[1]?.startPart).toBe(2)
  })
})

describe("failure isolation", () => {
  it("a DB error during counter refresh never changes message states", async () => {
    const seeded = await seedBatch(t.db, 6)
    const failing = new Proxy(t.db, {
      get(target, prop) {
        if (prop === "run") return () => Promise.reject(new Error("refresh boom"))
        return Reflect.get(target, prop, target)
      },
    }) as DB
    await expect(
      processPendingMessages(seeded.batchId, {
        ...opts({ gateway: okGateway() }),
        db: failing,
      })
    ).rejects.toThrow("refresh boom")
    const counts = await statusCounts(t.db, seeded.batchId)
    expect(counts.failed ?? 0).toBe(0)
    expect(counts.unknown ?? 0).toBe(0)
    expect(counts.sending ?? 0).toBe(0)
    expect((counts.sent ?? 0) + (counts.pending ?? 0)).toBe(6)
  })

  it("an engine error leaves unprocessed messages pending and does not mass-fail", async () => {
    const seeded = await seedBatch(t.db, 5)
    let messageUpdates = 0
    const flaky = new Proxy(t.db, {
      get(target, prop) {
        if (prop === "update")
          return (table: unknown) => {
            if (table === messages && ++messageUpdates === 4)
              throw new Error("claim boom")
            return target.update(table as typeof messages)
          }
        return Reflect.get(target, prop, target)
      },
    }) as DB
    await expect(
      processPendingMessages(seeded.batchId, {
        ...opts({ gateway: okGateway(), concurrency: 1, concurrencyMax: 1 }),
        db: flaky,
      })
    ).rejects.toThrow("claim boom")
    expect(await statusCounts(t.db, seeded.batchId)).toEqual({
      sent: 1,
      pending: 4,
    })
    expect((await batch(seeded.batchId))?.runnerId).toBeNull()
  })
})

describe("reaper", () => {
  it("turns stuck sending rows into unknown and leaves fresh ones", async () => {
    const seeded = await seedBatch(t.db, 0)
    const stuck = await createMessage(t.db, {
      invoiceId: seeded.invoiceId,
      status: "sending",
      claimedAt: "2026-01-01 11:50:00",
    })
    const fresh = await createMessage(t.db, {
      invoiceId: seeded.invoiceId,
      status: "sending",
      claimedAt: "2026-01-01 11:59:00",
    })
    const reaped = await reapStuckMessages(seeded.batchId, 120_000, {
      db: t.db,
      now: () => clock,
    })
    expect(reaped).toBe(1)
    expect(await row(stuck.id)).toMatchObject({ status: "unknown" })
    expect((await row(stuck.id))?.errorReason).toContain(UNCERTAIN)
    expect((await row(fresh.id))?.status).toBe("sending")
  })

  it("never turns a stuck row into pending", async () => {
    const seeded = await seedBatch(t.db, 0)
    const stuck = await createMessage(t.db, {
      invoiceId: seeded.invoiceId,
      status: "sending",
      claimedAt: "2025-12-31 00:00:00",
    })
    await reapStuckMessages(undefined, 120_000, { db: t.db, now: () => clock })
    expect((await row(stuck.id))?.status).toBe("unknown")
  })

  it("scopes to one batch when given and covers all batches otherwise", async () => {
    const a = await seedBatch(t.db, 0)
    const b = await seedBatch(t.db, 0)
    const ma = await createMessage(t.db, {
      invoiceId: a.invoiceId,
      status: "sending",
      claimedAt: "2025-12-31 00:00:00",
    })
    const mb = await createMessage(t.db, {
      invoiceId: b.invoiceId,
      status: "sending",
      claimedAt: "2025-12-31 00:00:00",
    })
    await reapStuckMessages(a.batchId, 120_000, { db: t.db, now: () => clock })
    expect((await row(ma.id))?.status).toBe("unknown")
    expect((await row(mb.id))?.status).toBe("sending")
    await reapStuckMessages(undefined, 120_000, { db: t.db, now: () => clock })
    expect((await row(mb.id))?.status).toBe("unknown")
  })

  it("refreshes counters of the batches it touched so a stuck-only batch completes", async () => {
    const a = await seedBatch(t.db, 0)
    await createMessage(t.db, {
      invoiceId: a.invoiceId,
      status: "sending",
      claimedAt: "2025-12-31 00:00:00",
    })
    await reapStuckMessages(undefined, 120_000, { db: t.db, now: () => clock })
    expect(await batch(a.batchId)).toMatchObject({
      status: "completed",
      unknown: 1,
    })
  })

  it("the engine reaps stuck rows of its own batch when it starts", async () => {
    const seeded = await seedBatch(t.db, 1)
    const stuck = await createMessage(t.db, {
      invoiceId: seeded.invoiceId,
      status: "sending",
      claimedAt: "2025-12-31 00:00:00",
    })
    await processPendingMessages(
      seeded.batchId,
      opts({ gateway: okGateway(), claimTimeoutMs: 120_000 })
    )
    expect((await row(stuck.id))?.status).toBe("unknown")
    expect((await batch(seeded.batchId))?.status).toBe("completed")
  })
})

describe("counters", () => {
  it("refreshBatchCounters counts sent, failed, unknown and keeps sending open", async () => {
    const seeded = await seedBatch(t.db, 0)
    for (const status of ["sent", "sent", "failed", "unknown", "sending"] as const)
      await createMessage(t.db, { invoiceId: seeded.invoiceId, status })
    await refreshBatchCounters(seeded.batchId, t.db)
    expect(await batch(seeded.batchId)).toMatchObject({
      sent: 2,
      failed: 1,
      unknown: 1,
      status: "sending",
    })
  })

  it("is refreshed at most every K messages plus once at the end", async () => {
    const seeded = await seedBatch(t.db, 250)
    let refreshes = 0
    const counting = new Proxy(t.db, {
      get(target, prop) {
        if (prop === "run")
          return (q: Parameters<DB["run"]>[0]) => {
            refreshes++
            return target.run(q)
          }
        return Reflect.get(target, prop, target)
      },
    }) as DB
    await processPendingMessages(seeded.batchId, {
      ...opts({
        gateway: okGateway(),
        counterEveryMessages: 100,
        counterEveryMs: 10_000_000,
      }),
      db: counting,
    })
    expect(refreshes).toBeGreaterThanOrEqual(1)
    expect(refreshes).toBeLessThanOrEqual(4)
  })
})

describe("worker pool", () => {
  it("never exceeds the configured concurrency", async () => {
    const seeded = await seedBatch(t.db, 30)
    let inFlight = 0
    let max = 0
    const gateway = gatewayOf(async () => {
      inFlight++
      max = Math.max(max, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { ok: true, messageId: "x" }
    })
    await processPendingMessages(
      seeded.batchId,
      opts({ gateway, concurrency: 4, concurrencyMax: 4 })
    )
    expect(max).toBeLessThanOrEqual(4)
    expect(max).toBeGreaterThan(1)
  })

  it("a slow message does not block the other slots", async () => {
    const seeded = await seedBatch(t.db, 10)
    const gate = createGate()
    const gateway = gatewayOf(async (to) => {
      if (to === seeded.numbers[0]) await gate.wait()
      return { ok: true, messageId: "x" }
    })
    const run = processPendingMessages(
      seeded.batchId,
      opts({ gateway, concurrency: 3, concurrencyMax: 3 })
    )
    await vi.waitFor(async () => {
      expect((await statusCounts(t.db, seeded.batchId)).sent).toBe(9)
    })
    expect((await row(seeded.messageIds[0] as number))?.status).toBe("sending")
    gate.open()
    await run
    expect((await statusCounts(t.db, seeded.batchId)).sent).toBe(10)
  })

  it("shrinks concurrency when the gateway turns slow", async () => {
    const seeded = await seedBatch(t.db, 120)
    let inFlight = 0
    const maxAfter: number[] = []
    let sent = 0
    const gateway = gatewayOf(async () => {
      inFlight++
      sent++
      if (sent > 60) maxAfter.push(inFlight)
      clock += 30_000
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return { ok: true, messageId: "x" }
    })
    await processPendingMessages(
      seeded.batchId,
      opts({ gateway, concurrency: 10, concurrencyMax: 20, budgetMs: 1e12 })
    )
    expect(Math.max(...maxAfter.slice(-20))).toBeLessThan(10)
  })
})

describe("time budget and chaining", () => {
  function clockGateway(latencyMs: number) {
    const sentTo: string[] = []
    const gateway: SmsGateway = {
      send: async (to) => {
        clock += latencyMs
        sentTo.push(to)
        return { ok: true, messageId: `id-${to}` }
      },
    }
    return { gateway, sentTo }
  }

  it("15-minute cut: 3,000 messages across chained runs, each sent exactly once", async () => {
    const seeded = await seedBatch(t.db, 3000)
    const { gateway, sentTo } = clockGateway(1_000)
    const budgetMs = 12 * 60_000

    const first = await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs, hop: 0 })
    )
    expect(first.outcome).toBe("chained")
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(seeded.batchId, { hop: 1 })
    const counts = await statusCounts(t.db, seeded.batchId)
    expect(counts.pending).toBeGreaterThan(0)
    expect(counts.sending ?? 0).toBe(0)
    expect(counts.sent).toBeGreaterThan(0)
    expect(counts.sent).toBeLessThan(3000)
    expect((await batch(seeded.batchId))?.runnerId).toBeNull()

    let hop = 1
    let last = first
    while (last.outcome === "chained") {
      dispatch.mockClear()
      last = await processPendingMessages(
        seeded.batchId,
        opts({ gateway, budgetMs, hop })
      )
      if (last.outcome === "chained") {
        expect(dispatch).toHaveBeenCalledTimes(1)
        expect(dispatch).toHaveBeenCalledWith(seeded.batchId, { hop: hop + 1 })
      }
      hop++
      expect(hop).toBeLessThan(10)
    }
    expect(last.outcome).toBe("completed")
    expect(sentTo).toHaveLength(3000)
    expect(new Set(sentTo).size).toBe(3000)
    expect(await batch(seeded.batchId)).toMatchObject({
      status: "completed",
      sent: 3000,
    })
  }, 120_000)

  it("stops claiming at the budget and lets in-flight sends finish", async () => {
    const seeded = await seedBatch(t.db, 50)
    const { gateway } = clockGateway(10_000)
    await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 30_000, concurrency: 5, concurrencyMax: 5 })
    )
    const counts = await statusCounts(t.db, seeded.batchId)
    expect(counts.sending ?? 0).toBe(0)
    expect(counts.pending).toBeGreaterThan(0)
  })

  it("does not chain when everything finished within the budget", async () => {
    const seeded = await seedBatch(t.db, 5)
    const res = await processPendingMessages(
      seeded.batchId,
      opts({ gateway: okGateway(), budgetMs: 1_000_000 })
    )
    expect(res.outcome).toBe("completed")
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("the hop cap stops a runaway chain without dispatching", async () => {
    const seeded = await seedBatch(t.db, 20)
    const { gateway } = clockGateway(10_000)
    const atCap = await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 1, hop: 100, maxHops: 100, concurrency: 1, concurrencyMax: 1 })
    )
    expect(atCap.outcome).toBe("hop_cap")
    expect(dispatch).not.toHaveBeenCalled()
    const below = await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 1, hop: 99, maxHops: 100, concurrency: 1, concurrencyMax: 1 })
    )
    expect(below.outcome).toBe("chained")
    expect(dispatch).toHaveBeenCalledWith(seeded.batchId, { hop: 100 })
  })

  it("a rejected dispatch is surfaced but leaves the batch recoverable", async () => {
    const seeded = await seedBatch(t.db, 10)
    const { gateway } = clockGateway(10_000)
    dispatch.mockResolvedValue({ ok: false, status: 500, error: "nope" })
    const res = await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 1, concurrency: 1, concurrencyMax: 1 })
    )
    expect(res.outcome).toBe("chain_failed")
    expect(console.error).toHaveBeenCalled()
    const b = await batch(seeded.batchId)
    expect(b).toMatchObject({ status: "sending", runnerId: null })
    expect((await statusCounts(t.db, seeded.batchId)).pending).toBeGreaterThan(0)
  })

  it("a throwing dispatch does not make the run throw", async () => {
    const seeded = await seedBatch(t.db, 10)
    const { gateway } = clockGateway(10_000)
    dispatch.mockRejectedValue(new Error("network"))
    const res = await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 1, concurrency: 1, concurrencyMax: 1 })
    )
    expect(res.outcome).toBe("chain_failed")
  })

  it("releases the lease before dispatching so the continuation can acquire it", async () => {
    const seeded = await seedBatch(t.db, 10)
    const { gateway } = clockGateway(10_000)
    let leaseAtDispatch: string | null | undefined
    dispatch.mockImplementation(async () => {
      leaseAtDispatch = (await batch(seeded.batchId))?.runnerId
      return { ok: true, status: 202 }
    })
    await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 1, concurrency: 1, concurrencyMax: 1 })
    )
    expect(leaseAtDispatch).toBeNull()
  })
})

describe("scale", () => {
  it("processes 10,000 pending rows without variable-limit errors", async () => {
    const seeded = await seedBatch(t.db, 10_000)
    const gateway = okGateway()
    const res = await processPendingMessages(
      seeded.batchId,
      opts({ gateway, budgetMs: 1e12 })
    )
    expect(res.outcome).toBe("completed")
    expect(gateway.calls).toHaveLength(10_000)
    expect(await batch(seeded.batchId)).toMatchObject({
      status: "completed",
      sent: 10_000,
    })
  }, 180_000)
})
