import { Workbook } from "exceljs"
import { Buffer } from "node:buffer"
import { describe, expect, it } from "vitest"

import type { ParsedInvoice } from "./excel-parser"
import { isExcelParseError, parseInvoiceExcel } from "./excel-parser"

const TOTAL_MARKER = "الإجمالي"

async function buildInvoiceBuffer(
  rows: Array<{
    number?: number | null
    client?: string | null
    apartment?: string | null
    type?: string | null
    amounts?: Array<number | null>
  }>,
  opts: { mergeClient?: boolean; mergeApartment?: boolean } = {}
): Promise<Buffer> {
  const wb = new Workbook()
  const ws = wb.addWorksheet("Invoices")

  rows.forEach((r, idx) => {
    const rowNum = idx + 1
    const row = ws.getRow(rowNum)
    if (r.number !== undefined) row.getCell(1).value = r.number
    if (r.client !== undefined) row.getCell(2).value = r.client
    if (r.apartment !== undefined) row.getCell(3).value = r.apartment
    if (r.type !== undefined) row.getCell(4).value = r.type
    if (r.amounts) {
      r.amounts.forEach((amt, i) => {
        row.getCell(5 + i).value = amt
      })
    }
    row.commit()
  })

  if (opts.mergeClient || opts.mergeApartment) {
    let start = 0
    for (let i = 0; i < rows.length; i++) {
      const isLast = i === rows.length - 1
      const nextDiffers = !isLast && rows[i + 1].apartment !== rows[i].apartment
      if (isLast || nextDiffers) {
        if (opts.mergeApartment && i > start) {
          ws.mergeCells(start + 1, 3, i + 1, 3)
        }
        if (opts.mergeClient && i > start) {
          ws.mergeCells(start + 1, 2, i + 1, 2)
        }
        start = i + 1
      }
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

function expectClose(actual: number, expected: number, tolerance = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
}

describe("excel-parser", () => {
  describe("parseInvoiceExcel — happy path", () => {
    it("extracts apartments with merged client/apartment cells and totals", async () => {
      const buffer = await buildInvoiceBuffer(
        [
          {
            number: 1,
            client: "عبدالله زيادة",
            apartment: "A101",
            type: "كهرباء",
            amounts: [100, 200, 300],
          },
          {
            number: 2,
            client: "عبدالله زيادة",
            apartment: "A101",
            type: "مياه",
            amounts: [50, 75, 125],
          },
          {
            number: null,
            client: "عبدالله زيادة",
            apartment: "A101",
            type: TOTAL_MARKER,
            amounts: [null, null, null, null, 56840.8],
          },
          {
            number: 1,
            client: "سالم أحمد",
            apartment: "A102",
            type: "كهرباء",
            amounts: [80, 160, 240],
          },
          {
            number: null,
            client: "سالم أحمد",
            apartment: "A102",
            type: TOTAL_MARKER,
            amounts: [null, null, null, null, 31965.3],
          },
          {
            number: 1,
            client: "محمد علي",
            apartment: "A103",
            type: "كهرباء",
            amounts: [200, 400, 600],
          },
          {
            number: null,
            client: "محمد علي",
            apartment: "A103",
            type: TOTAL_MARKER,
            amounts: [null, null, null, null, 97448.8],
          },
        ],
        { mergeClient: true, mergeApartment: true }
      )

      const result = await parseInvoiceExcel(buffer)
      expect(result).toHaveLength(3)
      const byLabel = new Map(result.map((r) => [r.label, r]))
      expect(byLabel.get("A101")?.clientName).toBe("عبدالله زيادة")
      expectClose(byLabel.get("A101")?.total ?? 0, 56840.8)
      expect(byLabel.get("A102")?.clientName).toBe("سالم أحمد")
      expectClose(byLabel.get("A102")?.total ?? 0, 31965.3)
      expect(byLabel.get("A103")?.clientName).toBe("محمد علي")
      expectClose(byLabel.get("A103")?.total ?? 0, 97448.8)
    })

    it("preserves apartment order as encountered in the file", async () => {
      const buffer = await buildInvoiceBuffer([
        {
          number: 1,
          client: "X",
          apartment: "Z9",
          type: "كهرباء",
          amounts: [10],
        },
        {
          number: null,
          client: "X",
          apartment: "Z9",
          type: TOTAL_MARKER,
          amounts: [null, 100],
        },
        {
          number: 1,
          client: "Y",
          apartment: "A1",
          type: "كهرباء",
          amounts: [20],
        },
        {
          number: null,
          client: "Y",
          apartment: "A1",
          type: TOTAL_MARKER,
          amounts: [null, 200],
        },
      ])
      const result = await parseInvoiceExcel(buffer)
      expect(result.map((r) => r.label)).toEqual(["Z9", "A1"])
    })

    it("handles non-merged cells (single row per apartment)", async () => {
      const buffer = await buildInvoiceBuffer([
        {
          number: 1,
          client: "Solo",
          apartment: "B1",
          type: TOTAL_MARKER,
          amounts: [500],
        },
      ])
      const result = await parseInvoiceExcel(buffer)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual<ParsedInvoice>({
        label: "B1",
        clientName: "Solo",
        total: 500,
      })
    })

    it("picks the last numeric column as the total when multiple numerics exist", async () => {
      const buffer = await buildInvoiceBuffer([
        {
          number: 1,
          client: "C",
          apartment: "C1",
          type: TOTAL_MARKER,
          amounts: [10, 20, 30, 999],
        },
      ])
      const result = await parseInvoiceExcel(buffer)
      expect(result[0]?.total).toBe(999)
    })
  })

  describe("parseInvoiceExcel — error cases", () => {
    it("throws empty_file when the workbook has no worksheets", async () => {
      const wb = new Workbook()
      const arrayBuffer = await wb.xlsx.writeBuffer()
      const buffer = Buffer.from(arrayBuffer)
      try {
        await parseInvoiceExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isExcelParseError(e)).toBe(true)
        if (isExcelParseError(e)) expect(e.code).toBe("empty_file")
      }
    })

    it("throws no_apartment_rows when no rows have an apartment label", async () => {
      const buffer = await buildInvoiceBuffer([
        {
          number: 1,
          client: "X",
          apartment: null,
          type: "كهرباء",
          amounts: [10],
        },
      ])
      try {
        await parseInvoiceExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isExcelParseError(e)).toBe(true)
        if (isExcelParseError(e)) expect(e.code).toBe("no_apartment_rows")
      }
    })

    it("throws missing_total when an apartment has no الإجمالي row", async () => {
      const buffer = await buildInvoiceBuffer([
        {
          number: 1,
          client: "X",
          apartment: "A101",
          type: "كهرباء",
          amounts: [10],
        },
        {
          number: 1,
          client: "Y",
          apartment: "A102",
          type: TOTAL_MARKER,
          amounts: [null, 200],
        },
      ])
      try {
        await parseInvoiceExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isExcelParseError(e)).toBe(true)
        if (isExcelParseError(e)) {
          expect(e.code).toBe("missing_total")
          expect(e.label).toBe("A101")
        }
      }
    })

    it("throws no_numeric_total when الإجمالي row has no numeric value", async () => {
      const buffer = await buildInvoiceBuffer([
        {
          number: null,
          client: "X",
          apartment: "A101",
          type: TOTAL_MARKER,
          amounts: [null, null],
        },
      ])
      try {
        await parseInvoiceExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isExcelParseError(e)).toBe(true)
        if (isExcelParseError(e)) {
          expect(e.code).toBe("no_numeric_total")
          expect(e.label).toBe("A101")
        }
      }
    })
  })
})
