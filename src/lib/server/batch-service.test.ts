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
  const consume = () => results.shift() ?? []
  let currentTable: unknown
  const insertChain = {
    returning: vi.fn(() => Promise.resolve(consume())),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve([]).then(resolve),
  }
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(() => Promise.resolve(consume())),
    orderBy: vi.fn(() => Promise.resolve(consume())),
    offset: vi.fn(() => selectChain),
    groupBy: vi.fn(() => selectChain),
    innerJoin: vi.fn(() => selectChain),
    values: vi.fn((vals: unknown) => {
      insertCalls.push({ table: currentTable, values: vals })
      return insertChain
    }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(consume()).then(resolve),
  }
  return {
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn((table: unknown) => {
        currentTable = table
        return selectChain
      }),
      __setResults: (r: unknown[]) => {
        results = r
      },
      __insertCalls: insertCalls,
      __clearInsertCalls: () => {
        insertCalls.length = 0
      },
    },
  }
})

const { db } = await import("@/lib/server/db")
const { createBatch } = await import("./batch-service")
const { parseInvoiceExcel } = await import("./excel-parser")
const { requireRole } = await import("@/lib/server/auth-helpers")

function buildFormData(file: File): FormData {
  const fd = new FormData()
  fd.set("title", "دفعة تجريبية")
  fd.set("projectId", "1")
  fd.set("file", file)
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
      [
        { id: 10, label: "A101", projectId: 1 },
        { id: 11, label: "A102", projectId: 1 },
        { id: 12, label: "A103", projectId: 1 },
      ],
      [{ label: "A101" }, { label: "A102" }, { label: "A103" }],
      [{ id: 500 }],
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
      [{ id: 10, label: "A101", projectId: 1 }],
      [{ label: "A101" }, { label: "A102" }],
      [{ id: 501 }],
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
    ).__setResults([[{ id: 1 }], [], [], [{ id: 1 }]])

    await createBatch(buildFormData(makeFile()))

    expect(requireRole).toHaveBeenCalledWith("operator")
    expect(requireRole).not.toHaveBeenCalledWith("admin")
  })
})
