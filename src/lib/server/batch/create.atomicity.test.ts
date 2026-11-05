import { count } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { batchSessions, invoices } from "@/lib/server/schema"
import {
  authHelpersModule,
  operatorUser,
  resetAuth,
  setTestUser,
} from "@/test/auth"
import { createTestDb, type TestDb } from "@/test/db"
import {
  createApartment,
  createProject,
  createTower,
  createUser,
} from "@/test/fixtures"

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
vi.mock("@/lib/server/excel-balance-parser", () => ({
  parseBalanceSheetExcel: vi.fn(async () => ({
    invoices: [],
    skippedCredit: [],
    skippedTiny: [],
  })),
  isBalanceParseError: vi.fn(() => false),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}))

const { createBatch } = await import("./create")
const { parseInvoiceExcel } = await import("@/lib/server/excel-parser")
const { parseBalanceSheetExcel } = await import(
  "@/lib/server/excel-balance-parser"
)

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const file = () => new File([new Uint8Array([0])], "f.xlsx", { type: XLSX })

let testDb: TestDb
let projectId: number

function form(
  entries: Record<string, string>,
  files: File[] = [],
  key = "files"
) {
  const fd = new FormData()
  fd.set("title", "دفعة")
  fd.set("projectId", String(projectId))
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  for (const f of files) fd.append(key, f)
  return fd
}

async function batchCount(): Promise<number> {
  const [r] = await testDb.db.select({ n: count() }).from(batchSessions)
  return r.n
}
async function invoiceCount(): Promise<number> {
  const [r] = await testDb.db.select({ n: count() }).from(invoices)
  return r.n
}

beforeEach(async () => {
  vi.mocked(parseInvoiceExcel).mockReset().mockResolvedValue([])
  vi.mocked(parseBalanceSheetExcel)
    .mockReset()
    .mockResolvedValue({ invoices: [], skippedCredit: [], skippedTiny: [] })
  testDb = await createTestDb()
  holder.db = testDb.db
  const user = await createUser(testDb.db)
  setTestUser(operatorUser({ id: user.id }))
  const project = await createProject(testDb.db, { createdBy: user.id })
  projectId = project.id
  const tower = await createTower(testDb.db, { projectId })
  await createApartment(testDb.db, { towerId: tower.id, label: "A101" })
  await createApartment(testDb.db, { towerId: tower.id, label: "A102" })
})

afterEach(async () => {
  resetAuth()
  await testDb.cleanup()
})

describe("createBatch leaves no batch row on failure", () => {
  it("parse error (invoice format)", async () => {
    vi.mocked(parseInvoiceExcel).mockRejectedValue(new Error("bad sheet"))
    const before = await batchCount()

    const result = await createBatch(
      form({ mode: "automatic", format: "invoice" }, [file()], "file")
    )

    expect(result).toMatchObject({ ok: false, error: "parse" })
    expect(await batchCount()).toBe(before)
  })

  it("parse error (balance format)", async () => {
    vi.mocked(parseBalanceSheetExcel).mockRejectedValue(new Error("bad sheet"))
    const before = await batchCount()

    const result = await createBatch(
      form({ mode: "automatic", format: "balance" }, [file()])
    )

    expect(result).toMatchObject({ ok: false, error: "parse" })
    expect(await batchCount()).toBe(before)
  })

  it("empty parse", async () => {
    const before = await batchCount()

    const result = await createBatch(
      form({ mode: "automatic", format: "balance" }, [file()])
    )

    expect(result).toEqual({ ok: false, error: "empty_parse" })
    expect(await batchCount()).toBe(before)
  })

  it("missing balance file", async () => {
    const before = await batchCount()

    const result = await createBatch(
      form({ mode: "automatic", format: "balance" })
    )

    expect(result).toMatchObject({ ok: false, error: "parse" })
    expect(await batchCount()).toBe(before)
  })

  it("every label unmatched", async () => {
    vi.mocked(parseBalanceSheetExcel).mockResolvedValue({
      invoices: [{ label: "X1", client_name: "c", total: 10 }],
      skippedCredit: [],
      skippedTiny: [],
    })
    const before = await batchCount()

    const result = await createBatch(
      form({ mode: "automatic", format: "balance" }, [file()])
    )

    expect(result).toMatchObject({ ok: false, error: "parse" })
    expect(await batchCount()).toBe(before)
  })

  it("manual mode on a project with no apartments", async () => {
    const empty = await createProject(testDb.db)
    const before = await batchCount()
    const fd = form({ mode: "manual" })
    fd.set("projectId", String(empty.id))

    const result = await createBatch(fd)

    expect(result).toEqual({ ok: false, error: "empty_project" })
    expect(await batchCount()).toBe(before)
  })

  it("invoice insert failing rolls the batch row back", async () => {
    vi.mocked(parseBalanceSheetExcel).mockResolvedValue({
      invoices: [{ label: "A101", client_name: "c", total: 10 }],
      skippedCredit: [],
      skippedTiny: [],
    })
    await testDb.client.execute(
      "CREATE TRIGGER fail_inv BEFORE INSERT ON invoices BEGIN SELECT RAISE(ABORT, 'injected failure'); END"
    )
    const before = await batchCount()

    await expect(
      createBatch(form({ mode: "automatic", format: "balance" }, [file()]))
    ).rejects.toThrow()

    expect(await batchCount()).toBe(before)
  })
})

describe("createBatch success", () => {
  it("creates exactly one batch with its invoices", async () => {
    vi.mocked(parseBalanceSheetExcel).mockResolvedValue({
      invoices: [
        { label: "A101", client_name: "c1", total: 10 },
        { label: "A102", client_name: "c2", total: 20 },
      ],
      skippedCredit: [],
      skippedTiny: [],
    })

    const result = await createBatch(
      form({ mode: "automatic", format: "balance" }, [file()])
    )

    if (!result.ok) throw new Error("expected ok")
    expect(await batchCount()).toBe(1)
    expect(await invoiceCount()).toBe(2)
    const [b] = await testDb.db.select().from(batchSessions)
    expect(b.id).toBe(result.batchId)
    expect(b.excelLabels).toBe(JSON.stringify(["A101", "A102"]))
  })

  it("manual mode seeds one invoice per apartment", async () => {
    const result = await createBatch(form({ mode: "manual" }))

    if (!result.ok) throw new Error("expected ok")
    expect(await batchCount()).toBe(1)
    expect(await invoiceCount()).toBe(2)
  })
})
