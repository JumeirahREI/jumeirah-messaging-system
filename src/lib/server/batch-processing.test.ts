import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SmsGateway } from "./sms-gateway"

vi.mock("@/lib/server/db", () => {
  const selectResults: unknown[][] = []
  const consumeSelect = () => selectResults.shift() ?? []
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    innerJoin: vi.fn(() => selectChain),
    groupBy: vi.fn(() => Promise.resolve(consumeSelect())),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(consumeSelect()).then(resolve),
  }
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(() => Promise.resolve()),
  }
  return {
    db: {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
      __setSelectResults: (rows: unknown[][]) => {
        selectResults.length = 0
        selectResults.push(...rows)
      },
    },
  }
})

vi.mock("@/lib/server/schema", () => ({
  batchSessions: { id: "batchSessions.id" },
  invoices: { batchId: "invoices.batchId", deletedAt: "invoices.deletedAt" },
  messages: {
    id: "messages.id",
    status: "messages.status",
    phoneNumberId: "messages.phoneNumberId",
    deletedAt: "messages.deletedAt",
  },
  phoneNumbers: { id: "phoneNumbers.id", number: "phoneNumbers.number" },
}))

const { db } = await import("@/lib/server/db")
const { processPendingMessages } = await import("./batch-processing")
const { setSmsGateway } = await import("./sms-gateway")

type DbMock = {
  __setSelectResults: (rows: unknown[][]) => void
}

function makeGateway(
  sendImpl: (
    to: string,
    body: string
  ) => Promise<{ ok: true; messageId: string } | { ok: false; error: string }>
): SmsGateway {
  return { send: sendImpl }
}

function setResults(...rows: unknown[][]): void {
  ;(db as unknown as DbMock).__setSelectResults(rows)
}

describe("processPendingMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setResults([])
  })

  it("processes all pending rows and marks them sent", async () => {
    const ids = [1, 2, 3]
    setResults(
      ids.map((id) => ({
        id,
        phoneNumberId: 100 + id,
        contents: `body ${id}`,
      })),
      ids.map((id) => ({
        id: 100 + id,
        number: `967777000${String(id).padStart(3, "0")}`,
      })),
      []
    )

    const sent: number[] = []
    setSmsGateway(
      makeGateway(async (to) => {
        sent.push(Number(to.slice(-3)))
        return { ok: true, messageId: `id-${to}` }
      })
    )

    await processPendingMessages(42)

    expect(sent.sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it("marks message failed when phone number is missing", async () => {
    setResults([{ id: 7, phoneNumberId: 999, contents: "x" }], [], [])

    const sendSpy = vi.fn(async () => ({ ok: true as const, messageId: "x" }))
    setSmsGateway(makeGateway(sendSpy))

    await processPendingMessages(42)

    expect(sendSpy).not.toHaveBeenCalled()
    expect(db.update).toHaveBeenCalled()
  })

  it("limits send concurrency to 5", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      phoneNumberId: 100 + i,
      contents: `body ${i}`,
    }))
    setResults(
      rows,
      rows.map((r) => ({
        id: r.phoneNumberId,
        number: `9677770${String(r.phoneNumberId).padStart(5, "0")}`,
      })),
      []
    )

    let inFlight = 0
    let maxInFlight = 0
    setSmsGateway(
      makeGateway(async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 10))
        inFlight--
        return { ok: true, messageId: "x" }
      })
    )

    await processPendingMessages(42)

    expect(maxInFlight).toBeLessThanOrEqual(5)
  })

  it("records failure when gateway returns error", async () => {
    setResults(
      [{ id: 1, phoneNumberId: 10, contents: "x" }],
      [{ id: 10, number: "967777000111" }],
      []
    )

    setSmsGateway(
      makeGateway(async () => ({ ok: false, error: "gateway down" }))
    )

    await processPendingMessages(42)

    expect(db.update).toHaveBeenCalled()
  })

  it("skips sending when no pending rows and refreshes counters", async () => {
    setResults([], [])

    const sendSpy = vi.fn(async () => ({ ok: true as const, messageId: "x" }))
    setSmsGateway(makeGateway(sendSpy))

    await processPendingMessages(42)

    expect(sendSpy).not.toHaveBeenCalled()
    expect(db.update).toHaveBeenCalled()
  })
})
