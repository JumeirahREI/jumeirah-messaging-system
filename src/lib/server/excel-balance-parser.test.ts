import { Workbook } from "exceljs"
import { Buffer } from "node:buffer"
import { describe, expect, it } from "vitest"

import {
  isBalanceParseError,
  parseBalanceSheetExcel,
  type BalanceParseResult,
} from "./excel-balance-parser"

type BalanceRow = {
  number?: number | string | null
  client?: string | number | null
  currency?: string | null
  debit?: number | string | null
  credit?: number | string | null
}

async function buildBalanceBuffer(rows: BalanceRow[]): Promise<Buffer> {
  const wb = new Workbook()
  const ws = wb.addWorksheet("ورقة1")
  rows.forEach((r, idx) => {
    const row = ws.getRow(idx + 1)
    if (r.number !== undefined) row.getCell(1).value = r.number
    if (r.client !== undefined) row.getCell(2).value = r.client
    if (r.currency !== undefined) row.getCell(4).value = r.currency
    if (r.debit !== undefined) row.getCell(5).value = r.debit
    if (r.credit !== undefined) row.getCell(6).value = r.credit
    row.commit()
  })
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

function headerRows(): BalanceRow[] {
  return [
    { number: null, client: null, currency: null, debit: null, credit: null },
    {
      number: "الرقم",
      client: "رقم العميل /   /   /  ",
      currency: "العملة",
      debit: "الرصيد الحالي",
      credit: "الرصيد الحالي",
    },
    { number: " ", client: " ", currency: " ", debit: "مدين", credit: "دائن" },
    { number: null, client: null, currency: null, debit: null, credit: null },
  ]
}

function footerRows(): BalanceRow[] {
  return [
    {
      number: "عدد السجلات",
      client: 77,
      currency: "إجمالي حسب العملة",
      debit: 8470148.93,
      credit: 1999.9,
    },
    {
      number: null,
      client: null,
      currency: null,
      debit: "رصيد مدين",
      credit: 8468149.03,
    },
  ]
}

describe("excel-balance-parser", () => {
  describe("parseBalanceSheetExcel — happy path", () => {
    it("parses debit rows into invoices with label extracted from client name", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010001,
          client: "عبدالله زبارة A101",
          currency: "YER",
          debit: 48944.9,
          credit: null,
        },
        {
          number: 20010002,
          client: "امة المجيب الدرة شقة رقم A102",
          currency: "YER",
          debit: 16165.3,
          credit: null,
        },
        ...footerRows(),
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(2)
      expect(result.invoices[0]).toEqual({
        label: "A101",
        client_name: "عبدالله زبارة",
        total: 48944.9,
      })
      expect(result.invoices[1]).toEqual({
        label: "A102",
        client_name: "امة المجيب الدرة",
        total: 16165.3,
      })
    })

    it("extracts label when شقة رقم has no trailing space", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 10010001,
          client: "حميدة محمد علي الشرفي شقة رقمB101",
          currency: "YER",
          debit: 58788.43,
          credit: null,
        },
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices[0]?.label).toBe("B101")
      expect(result.invoices[0]?.client_name).toBe("حميدة محمد علي الشرفي")
    })

    it("extracts compound labels like A205-305", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010015,
          client: "احمد يوسف عبد الودود شقة رقم A205-305",
          currency: "YER",
          debit: 1999.9,
          credit: null,
        },
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices[0]?.label).toBe("A205-305")
      expect(result.invoices[0]?.client_name).toBe("احمد يوسف عبد الودود")
    })

    it("skips header and footer rows (non-numeric col A)", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010001,
          client: "عميل A101",
          currency: "YER",
          debit: 100,
          credit: null,
        },
        ...footerRows(),
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(1)
      expect(result.invoices[0]?.label).toBe("A101")
    })
  })

  describe("parseBalanceSheetExcel — skip classification", () => {
    it("skips credit rows (col F has value, col E null)", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010015,
          client: "احمد يوسف A205-305",
          currency: "YER",
          debit: null,
          credit: 1999.9,
        },
        {
          number: 20010001,
          client: "عميل A101",
          currency: "YER",
          debit: 500,
          credit: null,
        },
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(1)
      expect(result.invoices[0]?.label).toBe("A101")
      expect(result.skippedCredit).toHaveLength(1)
      expect(result.skippedCredit[0]).toEqual({
        label: "A205-305",
        clientName: "احمد يوسف",
        amount: 1999.9,
      })
    })

    it("skips tiny debit rows below threshold (1.0 YER)", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 10010003,
          client: "هيثم الجبري B103",
          currency: "YER",
          debit: 0.49,
          credit: null,
        },
        {
          number: 10010004,
          client: "عميل B104",
          currency: "YER",
          debit: 84026.57,
          credit: null,
        },
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(1)
      expect(result.invoices[0]?.label).toBe("B104")
      expect(result.skippedTiny).toHaveLength(1)
      expect(result.skippedTiny[0]?.amount).toBe(0.49)
    })

    it("skips zero-balance rows (both debit and credit null/0)", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010001,
          client: "عميل A101",
          currency: "YER",
          debit: 0,
          credit: 0,
        },
        {
          number: 20010002,
          client: "عميل A102",
          currency: "YER",
          debit: 250,
          credit: null,
        },
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(1)
      expect(result.skippedTiny).toHaveLength(1)
      expect(result.skippedTiny[0]?.amount).toBe(0)
    })

    it("treats debit as authoritative when both debit and credit present", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010001,
          client: "عميل A101",
          currency: "YER",
          debit: 300,
          credit: 50,
        },
      ])
      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(1)
      expect(result.invoices[0]?.total).toBe(300)
      expect(result.skippedCredit).toHaveLength(0)
    })
  })

  describe("parseBalanceSheetExcel — error cases", () => {
    it("throws empty_file when the workbook has no worksheets", async () => {
      const wb = new Workbook()
      const arrayBuffer = await wb.xlsx.writeBuffer()
      const buffer = Buffer.from(arrayBuffer)
      try {
        await parseBalanceSheetExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isBalanceParseError(e)).toBe(true)
        if (isBalanceParseError(e)) expect(e.code).toBe("empty_file")
      }
    })

    it("throws no_customer_rows when only header/footer rows present", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        ...footerRows(),
      ])
      try {
        await parseBalanceSheetExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isBalanceParseError(e)).toBe(true)
        if (isBalanceParseError(e)) expect(e.code).toBe("no_customer_rows")
      }
    })

    it("throws no_customer_rows when all rows are credit (no debit invoices)", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 20010001,
          client: "عميل A101",
          currency: "YER",
          debit: null,
          credit: 100,
        },
      ])
      try {
        await parseBalanceSheetExcel(buffer)
        throw new Error("should have thrown")
      } catch (e) {
        expect(isBalanceParseError(e)).toBe(true)
        if (isBalanceParseError(e)) expect(e.code).toBe("no_customer_rows")
      }
    })
  })

  describe("parseBalanceSheetExcel — multi-sheet", () => {
    it("aggregates rows across multiple sheets", async () => {
      const wb = new Workbook()
      const wsA = wb.addWorksheet("برجA")
      wsA.addRow([20010001, "عميل A101", null, "YER", 100, null]).commit()
      const wsB = wb.addWorksheet("برجB")
      wsB.addRow([10010001, "عميل B101", null, "YER", 200, null]).commit()
      const arrayBuffer = await wb.xlsx.writeBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const result = await parseBalanceSheetExcel(buffer)
      expect(result.invoices).toHaveLength(2)
      const byLabel = new Map(result.invoices.map((i) => [i.label, i]))
      expect(byLabel.get("A101")?.total).toBe(100)
      expect(byLabel.get("B101")?.total).toBe(200)
    })
  })

  describe("BalanceParseResult type contract", () => {
    it("returns the three-bucket shape", async () => {
      const buffer = await buildBalanceBuffer([
        ...headerRows(),
        {
          number: 1,
          client: "عميل A101",
          currency: "YER",
          debit: 100,
          credit: null,
        },
      ])
      const result: BalanceParseResult = await parseBalanceSheetExcel(buffer)
      expect(Array.isArray(result.invoices)).toBe(true)
      expect(Array.isArray(result.skippedCredit)).toBe(true)
      expect(Array.isArray(result.skippedTiny)).toBe(true)
    })
  })
})
