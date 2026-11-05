import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createBatch } from "@/test/fixtures"
import { createTestDb, type TestDb } from "@/test/db"
import { runConcurrently } from "@/test/concurrency"
import { batchSessions } from "@/lib/server/schema"

import {
  acquireLease,
  formatLeaseTime,
  releaseLease,
  renewLease,
} from "./lease"

let t: TestDb
let batchId: number
let clock: number
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

const deps = () => ({ db: t.db, now: () => clock })

async function leaseRow() {
  const [row] = await t.db
    .select({
      runnerId: batchSessions.runnerId,
      until: batchSessions.runnerLeaseUntil,
    })
    .from(batchSessions)
    .where(eq(batchSessions.id, batchId))
  return row
}

beforeEach(async () => {
  t = await createTestDb()
  batchId = (await createBatch(t.db, { status: "sending" })).id
  clock = T0
})

afterEach(async () => {
  await t.cleanup()
})

describe("formatLeaseTime", () => {
  it("matches the sqlite datetime('now') format", async () => {
    expect(formatLeaseTime(T0)).toBe("2026-01-01 12:00:00")
    const res = await t.client.execute("SELECT datetime('now') AS n")
    expect(String(res.rows[0]?.n)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(formatLeaseTime(Date.now())).toHaveLength(19)
  })
})

describe("acquireLease", () => {
  it("acquires a free lease and stores owner and expiry", async () => {
    expect(await acquireLease(batchId, "a", 120_000, deps())).toBe(true)
    expect(await leaseRow()).toEqual({
      runnerId: "a",
      until: "2026-01-01 12:02:00",
    })
  })

  it("a second worker cannot acquire a live lease", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    clock += 60_000
    expect(await acquireLease(batchId, "b", 120_000, deps())).toBe(false)
    expect((await leaseRow())?.runnerId).toBe("a")
  })

  it("the same runner can re-acquire its own lease", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    expect(await acquireLease(batchId, "a", 120_000, deps())).toBe(true)
  })

  it("an expired lease can be taken over", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    clock += 121_000
    expect(await acquireLease(batchId, "b", 120_000, deps())).toBe(true)
    expect((await leaseRow())?.runnerId).toBe("b")
  })

  it("boundary: still held at the exact expiry second, free one second later", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    clock = T0 + 120_000
    expect(await acquireLease(batchId, "b", 120_000, deps())).toBe(false)
    clock = T0 + 121_000
    expect(await acquireLease(batchId, "b", 120_000, deps())).toBe(true)
  })

  it("only one of many concurrent acquirers wins", async () => {
    const results = await runConcurrently(
      Array.from(
        { length: 8 },
        (_, i) => () => acquireLease(batchId, `w${i}`, 120_000, deps())
      )
    )
    const wins = results.filter(
      (r) => r.status === "fulfilled" && r.value === true
    )
    expect(wins).toHaveLength(1)
  })

  it("returns false for a missing or soft-deleted batch", async () => {
    expect(await acquireLease(999_999, "a", 1000, deps())).toBe(false)
    await t.db
      .update(batchSessions)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(batchSessions.id, batchId))
    expect(await acquireLease(batchId, "a", 1000, deps())).toBe(false)
  })
})

describe("renewLease", () => {
  it("extends the expiry for the owner", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    clock += 30_000
    expect(await renewLease(batchId, "a", 120_000, deps())).toBe(true)
    expect((await leaseRow())?.until).toBe("2026-01-01 12:02:30")
  })

  it("keeps another worker out while renewed", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    for (let i = 0; i < 6; i++) {
      clock += 60_000
      expect(await renewLease(batchId, "a", 120_000, deps())).toBe(true)
      expect(await acquireLease(batchId, "b", 120_000, deps())).toBe(false)
    }
  })

  it("fails for a non-owner and after takeover", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    expect(await renewLease(batchId, "b", 120_000, deps())).toBe(false)
    clock += 200_000
    await acquireLease(batchId, "b", 120_000, deps())
    expect(await renewLease(batchId, "a", 120_000, deps())).toBe(false)
  })
})

describe("releaseLease", () => {
  it("clears the lease for the owner", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    expect(await releaseLease(batchId, "a", deps())).toBe(true)
    expect(await leaseRow()).toEqual({ runnerId: null, until: null })
    expect(await acquireLease(batchId, "b", 120_000, deps())).toBe(true)
  })

  it("does nothing when called by a non-owner", async () => {
    await acquireLease(batchId, "a", 120_000, deps())
    expect(await releaseLease(batchId, "b", deps())).toBe(false)
    expect((await leaseRow())?.runnerId).toBe("a")
  })
})
