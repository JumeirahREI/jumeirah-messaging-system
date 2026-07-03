import type { Row, Worksheet } from "exceljs"
import { Workbook } from "exceljs"
import type { Buffer } from "node:buffer"

export type ParsedInvoice = {
  label: string
  clientName: string
  total: number
}

export type ParseError = {
  code:
    "empty_file" | "no_apartment_rows" | "missing_total" | "no_numeric_total"
  message: string
  label?: string
}

const TOTAL_MARKER = "الإجمالي"
const COL_CLIENT = 2
const COL_APARTMENT = 3
const COL_TYPE = 4

function isParseError(e: unknown): e is ParseError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as ParseError).code === "string" &&
    typeof (e as ParseError).message === "string"
  )
}

function throwParseError(err: ParseError): never {
  throw err
}

type CellValue = string | number | boolean | null

function readCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (typeof value === "object") {
    const hyper = value as {
      text?: unknown
      result?: unknown
      formula?: unknown
    }
    if (typeof hyper.result === "string" || typeof hyper.result === "number") {
      return hyper.result
    }
    if (typeof hyper.text === "string") return hyper.text
  }
  return null
}

type MergeRange = {
  top: number
  left: number
  bottom: number
  right: number
}

function parseMergeRange(raw: string): MergeRange | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(raw)
  if (!match) return null
  const left = colLetterToNumber(match[1])
  const right = colLetterToNumber(match[3])
  const top = Number(match[2])
  const bottom = Number(match[4])
  return { top, left, bottom, right }
}

function colLetterToNumber(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - "A".charCodeAt(0) + 1)
  }
  return n
}

function buildMergeResolver(
  worksheet: Worksheet
): (row: number, col: number) => CellValue {
  const merges: MergeRange[] = []
  for (const raw of worksheet.model.merges) {
    const range = parseMergeRange(raw)
    if (range) merges.push(range)
  }

  return (row: number, col: number): CellValue => {
    for (const m of merges) {
      if (row >= m.top && row <= m.bottom && col >= m.left && col <= m.right) {
        const anchor = worksheet.getRow(m.top).getCell(m.left)
        return readCell(anchor.value)
      }
    }
    return readCell(worksheet.getRow(row).getCell(col).value)
  }
}

function rowHasContent(row: Row): boolean {
  let hasContent = false
  row.eachCell({ includeEmpty: false }, (cell) => {
    const v = readCell(cell.value)
    if (v !== null && v !== "") hasContent = true
  })
  return hasContent
}

function extractTotalFromRow(row: Row): number | null {
  let lastNumeric: number | null = null
  const cellCount = row.cellCount
  for (let i = cellCount; i >= 1; i--) {
    const v = readCell(row.getCell(i).value)
    if (typeof v === "number" && Number.isFinite(v)) {
      lastNumeric = v
      break
    }
  }
  return lastNumeric
}

export async function parseInvoiceExcel(
  buffer: Buffer
): Promise<ParsedInvoice[]> {
  const workbook = new Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  if (workbook.worksheets.length === 0) {
    throwParseError({
      code: "empty_file",
      message: "الملف لا يحتوي على أي ورقة بيانات",
    })
  }
  const sheet: Worksheet = workbook.worksheets[0]

  const resolveCell = buildMergeResolver(sheet)
  const rowCount = sheet.rowCount
  if (rowCount === 0) {
    throwParseError({
      code: "empty_file",
      message: "الملف فارغ",
    })
  }

  type Group = {
    label: string
    clientName: string
    totalRow: number | null
  }
  const groups = new Map<string, Group>()
  const order: string[] = []

  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r)
    if (!rowHasContent(row)) continue

    const apartment = resolveCell(r, COL_APARTMENT)
    const typeValue = readCell(row.getCell(COL_TYPE).value)

    if (typeof apartment === "string" && apartment.trim().length > 0) {
      const label = apartment.trim()
      if (!groups.has(label)) {
        const client = resolveCell(r, COL_CLIENT)
        groups.set(label, {
          label,
          clientName: typeof client === "string" ? client.trim() : "",
          totalRow: null,
        })
        order.push(label)
      }
      if (typeof typeValue === "string" && typeValue.trim() === TOTAL_MARKER) {
        const g = groups.get(label)
        if (g && g.totalRow === null) g.totalRow = r
      }
    }
  }

  if (order.length === 0) {
    throwParseError({
      code: "no_apartment_rows",
      message: "لم يتم العثور على صفوف شقق في الملف",
    })
  }

  const result: ParsedInvoice[] = []
  for (const label of order) {
    const g = groups.get(label)
    if (!g) continue
    if (g.totalRow === null) {
      throwParseError({
        code: "missing_total",
        message: `الشقة ${label} لا تحتوي على صف "الإجمالي"`,
        label,
      })
    }
    const total = extractTotalFromRow(sheet.getRow(g.totalRow))
    if (total === null) {
      throwParseError({
        code: "no_numeric_total",
        message: `الشقة ${label}: صف "الإجمالي" لا يحتوي على قيمة رقمية`,
        label,
      })
    }
    result.push({ label: g.label, clientName: g.clientName, total })
  }

  return result
}

export function isExcelParseError(e: unknown): e is ParseError {
  return isParseError(e)
}
