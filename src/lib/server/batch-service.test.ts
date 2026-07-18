import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/auth-helpers", () => ({
  requireRole: vi.fn(async () => ({
    id: 7,
    fullname: "Operator",
    username: "operator",
    isAdmin: false,
  })),
}))

vi.mock("@/lib/server/batch-processing", () => ({
  processPendingMessages: vi.fn(async () => {}),
}))

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  mutationLimiter: null,
}))

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(async () => ({
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  })),
}))

vi.mock("@/lib/server/excel-parser", () => ({
  parseInvoiceExcel: vi.fn(async () => []),
  isExcelParseError: vi.fn(() => false),
  deriveTowerPrefix: vi.fn((s: string) => s),
  getSheetNames: vi.fn(async () => []),
}))

type InsertCall = { table: unknown; values: unknown }

vi.mock("@/lib/server/db", () => {
  const insertCalls: InsertCall[] = []
  let results: unknown[] = []
  let consumeCount = 0
  const consume = () => {
    consumeCount++
    return results.shift() ?? []
  }
  let currentTable: unknown
  const insertChain = {
    returning: vi.fn(() => Promise.resolve(consume())),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve([]).then(resolve),
  }
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(consume())),
      orderBy: vi.fn(() => Promise.resolve(consume())),
      offset: vi.fn(() => chain),
      groupBy: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      values: vi.fn((vals: unknown) => {
        insertCalls.push({ table: currentTable, values: vals })
        return insertChain
      }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(consume()).then(resolve),
    }
    return chain
  }
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(() => updateChain),
    returning: vi.fn(() => Promise.resolve(consume())),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve),
  }
  return {
    db: {
      select: vi.fn(() => makeSelectChain()),
      insert: vi.fn((table: unknown) => {
        currentTable = table
        return makeSelectChain()
      }),
      update: vi.fn(() => updateChain),
      __setResults: (r: unknown[]) => {
        results = r
        consumeCount = 0
      },
      __insertCalls: insertCalls,
      __clearInsertCalls: () => {
        insertCalls.length = 0
      },
    },
  }
})

const { db } = await import("@/lib/server/db")
const {
  createBatch,
  updateInvoiceTotal,
  sendBatch,
  acquireBatchLock,
  releaseBatchLock,
  heartbeatBatchLock,
  forceReleaseBatchLock,
} = await import("./batch-service")
const { parseInvoiceExcel } = await import("./excel-parser")
const { requireRole } = await import("@/lib/server/auth-helpers")

function buildFormData(file: File): FormData {
  const fd = new FormData()
  fd.set("title", "دفعة تجريبية")
  fd.set("projectId", "1")
  fd.set("mode", "automatic")
  fd.set("file", file)
  return fd
}

function buildManualFormData(): FormData {
  const fd = new FormData()
  fd.set("title", "دفعة يدوية")
  fd.set("projectId", "1")
  fd.set("mode", "manual")
  return fd
}

function makeFile(): File {
  const blob = new Blob([new Uint8Array([0])], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  return new File([blob], "invoices.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

describe("createBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
    ;(
      db as unknown as {
        __clearInsertCalls: () => void
      }
    ).__clearInsertCalls()
  })

  it("inserts invoices for ALL matched apartments even when no contacts exist", async () => {
    const parsed = [
      { label: "A101", client_name: "عبدالله", total: 100 },
      { label: "A102", client_name: "سالم", total: 200 },
      { label: "A103", client_name: "محمد", total: 300 },
    ]
    vi.mocked(parseInvoiceExcel).mockResolvedValue(parsed)

    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 1 }],
      [{ id: 500 }],
      [
        { id: 10, label: "A101", projectId: 1 },
        { id: 11, label: "A102", projectId: 1 },
        { id: 12, label: "A103", projectId: 1 },
      ],
      [{ label: "A101" }, { label: "A102" }, { label: "A103" }],
    ])

    const result = await createBatch(buildFormData(makeFile()))

    expect(result).toEqual({
      ok: true,
      batchId: 500,
      unmatchedCount: 0,
      missingCount: 0,
    })

    const insertCalls = (db as unknown as { __insertCalls: InsertCall[] })
      .__insertCalls

    const invoiceInsert = insertCalls.find((c) => Array.isArray(c.values))
    expect(invoiceInsert).toBeDefined()
    const invoiceValues = invoiceInsert!.values as Array<{
      apartmentId: number
      clientName: string
      total: number
    }>
    expect(invoiceValues).toHaveLength(3)
    expect(invoiceValues.map((v) => v.apartmentId).sort()).toEqual([10, 11, 12])
    expect(invoiceValues.every((v) => v.clientName && v.total > 0)).toBe(true)
  })

  it("returns unmatchedCount for excel labels with no matching apartment", async () => {
    const parsed = [
      { label: "A101", client_name: "عبدالله", total: 100 },
      { label: "X999", client_name: "غريب", total: 50 },
    ]
    vi.mocked(parseInvoiceExcel).mockResolvedValue(parsed)

    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 1 }],
      [{ id: 501 }],
      [{ id: 10, label: "A101", projectId: 1 }],
      [{ label: "A101" }, { label: "A102" }],
    ])

    const result = await createBatch(buildFormData(makeFile()))

    if (!result.ok) throw new Error("expected ok result")
    expect(result.unmatchedCount).toBe(1)
    expect(result.missingCount).toBe(1)
    expect(result.batchId).toBe(501)

    const insertCalls = (db as unknown as { __insertCalls: InsertCall[] })
      .__insertCalls
    const invoiceInsert = insertCalls.find((c) => Array.isArray(c.values))
    const invoiceValues = invoiceInsert!.values as Array<{
      apartmentId: number
    }>
    expect(invoiceValues).toHaveLength(1)
    expect(invoiceValues[0].apartmentId).toBe(10)
  })

  it("requires operator role (not admin)", async () => {
    vi.mocked(parseInvoiceExcel).mockResolvedValue([])
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 1 }], [{ id: 1 }], [], []])

    await createBatch(buildFormData(makeFile()))

    expect(requireRole).toHaveBeenCalledWith("operator")
    expect(requireRole).not.toHaveBeenCalledWith("admin")
  })
})

describe("createBatch manual mode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
    ;(
      db as unknown as {
        __clearInsertCalls: () => void
      }
    ).__clearInsertCalls()
  })

  it("seeds invoices for every apartment with total 0 and empty clientName", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 1 }],
      [{ id: 700 }],
      [
        { id: 10, label: "A101", projectId: 1 },
        { id: 11, label: "A102", projectId: 1 },
      ],
    ])

    const result = await createBatch(buildManualFormData())

    expect(result).toEqual({
      ok: true,
      batchId: 700,
      unmatchedCount: 0,
      missingCount: 0,
    })

    const insertCalls = (db as unknown as { __insertCalls: InsertCall[] })
      .__insertCalls
    const invoiceInsert = insertCalls.find((c) => Array.isArray(c.values))
    expect(invoiceInsert).toBeDefined()
    const invoiceValues = invoiceInsert!.values as Array<{
      apartmentId: number
      clientName: string
      total: number
    }>
    expect(invoiceValues).toHaveLength(2)
    expect(invoiceValues.map((v) => v.apartmentId).sort()).toEqual([10, 11])
    expect(invoiceValues.every((v) => v.clientName === "")).toBe(true)
    expect(invoiceValues.every((v) => v.total === 0)).toBe(true)
  })

  it("returns empty_project error when project has no apartments", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 1 }], [{ id: 700 }], []])

    const result = await createBatch(buildManualFormData())

    expect(result).toEqual({ ok: false, error: "empty_project" })
  })

  it("does not call parseInvoiceExcel in manual mode", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 1 }],
      [{ id: 800 }],
      [{ id: 10, label: "A101", projectId: 1 }],
    ])

    await createBatch(buildManualFormData())

    expect(parseInvoiceExcel).not.toHaveBeenCalled()
  })
})

describe("updateInvoiceTotal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
    ;(
      db as unknown as {
        __clearInsertCalls: () => void
      }
    ).__clearInsertCalls()
  })

  it("updates total when invoice belongs to a draft batch", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 30, batchId: 5, status: "draft" }], [{ id: 30 }]])

    const result = await updateInvoiceTotal({ invoiceId: 30, total: 250.5 })

    expect(result).toEqual({ ok: true })
  })

  it("rejects when invoice batch is not draft", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 30, batchId: 5, status: "sending" }]])

    const result = await updateInvoiceTotal({ invoiceId: 30, total: 100 })

    expect(result).toEqual({
      ok: false,
      error: "لا يمكن تعديل فاتورة في دفعة ليست مسودة",
    })
  })

  it("rejects when invoice does not exist", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[]])

    const result = await updateInvoiceTotal({ invoiceId: 999, total: 100 })

    expect(result).toEqual({ ok: false, error: "الفاتورة غير موجودة" })
  })

  it("rejects negative total", async () => {
    const result = await updateInvoiceTotal({ invoiceId: 30, total: -5 })

    expect(result).toEqual({ ok: false, error: "المبلغ يجب أن يكون غير سالب" })
  })

  it("rejects non-finite total", async () => {
    const result = await updateInvoiceTotal({ invoiceId: 30, total: NaN })

    expect(result).toEqual({ ok: false, error: "المبلغ غير صالح" })
  })
})

describe("sendBatch manual gating", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
    ;(
      db as unknown as {
        __clearInsertCalls: () => void
      }
    ).__clearInsertCalls()
  })

  it("blocks send when manual batch has apartments with no contacts and total > 0", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 5, projectId: 1, mode: "manual" }],
      [
        { id: 100, apartmentId: 10, clientName: "", total: 500 },
        { id: 101, apartmentId: 11, clientName: "", total: 300 },
      ],
      [],
      [
        { id: 10, label: "A101" },
        { id: 11, label: "A102" },
      ],
    ])

    const result = await sendBatch({ batchId: 5 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("A101")
      expect(result.error).toContain("A102")
    }
  })

  it("discards apartments with contacts and total = 0, sends the rest", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 5, projectId: 1, mode: "manual" }],
      [
        { id: 100, apartmentId: 10, clientName: "", total: 0 },
        { id: 101, apartmentId: 11, clientName: "", total: 250 },
      ],
      [
        { apartmentId: 10, contactId: 50 },
        { apartmentId: 11, contactId: 51 },
      ],
      [
        { id: 90, contactId: 50, number: "771234567" },
        { id: 91, contactId: 51, number: "771234568" },
      ],
      [
        { id: 10, label: "A101" },
        { id: 11, label: "A102" },
      ],
    ])

    const result = await sendBatch({ batchId: 5 })

    expect(result).toEqual({ ok: true, batchId: 5 })

    const insertCalls = (db as unknown as { __insertCalls: InsertCall[] })
      .__insertCalls
    const msgInsert = insertCalls.find((c) => Array.isArray(c.values))
    expect(msgInsert).toBeDefined()
    const msgs = msgInsert!.values as Array<{ invoiceId: number }>
    expect(msgs).toHaveLength(1)
    expect(msgs[0].invoiceId).toBe(101)
  })

  it("allows send when at least one apartment has contacts and total > 0", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 5, projectId: 1, mode: "manual" }],
      [
        { id: 100, apartmentId: 10, clientName: "", total: 0 },
        { id: 101, apartmentId: 11, clientName: "", total: 250 },
      ],
      [{ apartmentId: 11, contactId: 51 }],
      [{ id: 91, contactId: 51, number: "771234568" }],
      [
        { id: 10, label: "A101" },
        { id: 11, label: "A102" },
      ],
    ])

    const result = await sendBatch({ batchId: 5 })

    expect(result).toEqual({ ok: true, batchId: 5 })
  })

  it("returns error when no apartment has contacts and total > 0", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [{ id: 5, projectId: 1, mode: "manual" }],
      [
        { id: 100, apartmentId: 10, clientName: "", total: 0 },
        { id: 101, apartmentId: 11, clientName: "", total: 0 },
      ],
      [
        { apartmentId: 10, contactId: 50 },
        { apartmentId: 11, contactId: 51 },
      ],
      [{ id: 90, contactId: 50, number: "771234567" }],
      [{ id: 91, contactId: 51, number: "771234568" }],
      [
        { id: 10, label: "A101" },
        { id: 11, label: "A102" },
      ],
    ])

    const result = await sendBatch({ batchId: 5 })

    expect(result.ok).toBe(false)
  })
})

describe("acquireBatchLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
    ;(
      db as unknown as {
        __clearInsertCalls: () => void
      }
    ).__clearInsertCalls()
  })

  it("acquires lock when batch is draft + manual + unlocked", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [
        {
          id: 5,
          status: "draft",
          mode: "manual",
          lockedBy: null,
          lockedAt: null,
        },
      ],
      [],
    ])

    const result = await acquireBatchLock({ batchId: 5 })

    expect(result).toEqual({ ok: true })
  })

  it("rejects when batch not found", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[]])

    const result = await acquireBatchLock({ batchId: 999 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("الدفعة غير موجودة")
    }
  })

  it("rejects when batch is not draft", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [
        {
          id: 5,
          status: "sending",
          mode: "manual",
          lockedBy: null,
          lockedAt: null,
        },
      ],
    ])

    const result = await acquireBatchLock({ batchId: 5 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("الدفعة ليست مسودة")
    }
  })

  it("rejects when batch is automatic mode", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [
        {
          id: 5,
          status: "draft",
          mode: "automatic",
          lockedBy: null,
          lockedAt: null,
        },
      ],
    ])

    const result = await acquireBatchLock({ batchId: 5 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("القفل ينطبق على الدفعات اليدوية فقط")
    }
  })

  it("rejects when locked by another user (not expired)", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([
      [
        {
          id: 5,
          status: "draft",
          mode: "manual",
          lockedBy: 999,
          lockedAt: "2099-01-01 00:00:00",
        },
      ],
      [],
      [{ name: "Other User" }],
    ])

    const result = await acquireBatchLock({ batchId: 5 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("الدفعة مقفلة بواسطة مستخدم آخر")
      expect(result.lockedBy.lockedByName).toBe("Other User")
    }
  })
})

describe("releaseBatchLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
  })

  it("releases lock when caller owns it", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 5 }]])

    const result = await releaseBatchLock({ batchId: 5 })

    expect(result).toEqual({ ok: true })
  })

  it("rejects when caller does not own the lock", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[]])

    const result = await releaseBatchLock({ batchId: 5 })

    expect(result).toEqual({ ok: false, error: "لا تملك قفل هذه الدفعة" })
  })
})

describe("heartbeatBatchLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
  })

  it("refreshes lockedAt when caller owns the lock", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 5 }]])

    const result = await heartbeatBatchLock({ batchId: 5 })

    expect(result).toEqual({ ok: true })
  })

  it("rejects when caller does not own the lock", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[]])

    const result = await heartbeatBatchLock({ batchId: 5 })

    expect(result).toEqual({ ok: false, error: "لا تملك قفل هذه الدفعة" })
  })
})

describe("forceReleaseBatchLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([])
  })

  it("admin can force-release any lock", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[{ id: 5 }]])

    const result = await forceReleaseBatchLock({ batchId: 5 })

    expect(result).toEqual({ ok: true })
  })

  it("rejects when batch not found", async () => {
    ;(
      db as unknown as {
        __setResults: (r: unknown[]) => void
      }
    ).__setResults([[]])

    const result = await forceReleaseBatchLock({ batchId: 999 })

    expect(result).toEqual({ ok: false, error: "الدفعة غير موجودة" })
  })
})
