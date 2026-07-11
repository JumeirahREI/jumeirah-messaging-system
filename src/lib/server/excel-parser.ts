import type { Row, Worksheet } from "exceljs"
import ExcelJS from "exceljs"
import type { Buffer } from "node:buffer"

const { Workbook } = ExcelJS

export type ParsedInvoice = {
  label: string
  client_name: string
  total: number
}

export type ParseError = {
  code:
    | "empty_file"
    | "no_apartment_rows"
    | "missing_total"
    | "no_numeric_total"
    | "duplicate_total"
  message: string
  label?: string
}

const TOTAL_MARKERS = new Set(["الإجمالي", "الاجمالي"])
const HEADER_TYPE_MARKER = "النوع"
const HEADER_APARTMENT_MARKER = "رقم الشقة"
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
  const error = new Error(err.message) as Error & ParseError
  error.code = err.code
  if (err.label !== undefined) error.label = err.label
  throw error
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

function isHeaderRow(
  sheet: Worksheet,
  resolveCell: (row: number, col: number) => CellValue,
  row: number
): boolean {
  const typeValue = readCell(sheet.getRow(row).getCell(COL_TYPE).value)
  if (
    typeof typeValue === "string" &&
    typeValue.trim() === HEADER_TYPE_MARKER
  ) {
    return true
  }
  const apartment = resolveCell(row, COL_APARTMENT)
  if (
    typeof apartment === "string" &&
    apartment.trim() === HEADER_APARTMENT_MARKER
  ) {
    return true
  }
  return false
}

function isTotalRow(typeValue: CellValue): boolean {
  return typeof typeValue === "string" && TOTAL_MARKERS.has(typeValue.trim())
}

export function deriveTowerPrefix(sheetName: string): string {
  const match = /[A-Za-z]+$/.exec(sheetName.trim())
  return match ? match[0] : ""
}

function deriveApartmentLabel(
  apartment: CellValue,
  towerPrefix: string
): string | null {
  if (apartment === null) return null
  if (typeof apartment === "number") {
    return Number.isFinite(apartment) ? `${towerPrefix}${apartment}` : null
  }
  if (typeof apartment === "string") {
    const trimmed = apartment.trim()
    if (trimmed.length === 0 || trimmed === HEADER_APARTMENT_MARKER) return null
    if (/^\d/.test(trimmed)) return `${towerPrefix}${trimmed}`
    return trimmed
  }
  return null
}

type Group = {
  label: string
  client_name: string
  totalRow: number | null
  sheet: Worksheet
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_SHEETS = 50
const MAX_ROWS = 10000

export async function getSheetNames(buffer: Buffer): Promise<string[]> {
  if (buffer.length > MAX_FILE_SIZE)
    throwParseError({
      code: "empty_file",
      message: "حجم الملف يتجاوز 10 ميجابايت",
    })
  const workbook = new Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  if (workbook.worksheets.length > MAX_SHEETS)
    throwParseError({ code: "empty_file", message: "عدد الأوراق يتجاوز 50" })
  return workbook.worksheets.map((ws) => ws.name)
}

export async function parseInvoiceExcel(
  buffer: Buffer,
  sheetTowerMap?: Map<string, string>
): Promise<ParsedInvoice[]> {
  if (buffer.length > MAX_FILE_SIZE)
    throwParseError({
      code: "empty_file",
      message: "حجم الملف يتجاوز 10 ميجابايت",
    })
  const workbook = new Workbook()
  // exceljs expects ArrayBuffer; Buffer is compatible at runtime
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  if (workbook.worksheets.length === 0) {
    throwParseError({
      code: "empty_file",
      message: "الملف لا يحتوي على أي ورقة بيانات",
    })
  }
  if (workbook.worksheets.length > MAX_SHEETS)
    throwParseError({ code: "empty_file", message: "عدد الأوراق يتجاوز 50" })

  const groups = new Map<string, Group>()
  const order: string[] = []

  for (const sheet of workbook.worksheets) {
    if (sheetTowerMap !== undefined && !sheetTowerMap.has(sheet.name)) continue
    const towerPrefix =
      sheetTowerMap?.get(sheet.name) ?? deriveTowerPrefix(sheet.name)
    const resolveCell = buildMergeResolver(sheet)
    const rowCount = sheet.rowCount
    if (rowCount === 0) continue
    if (rowCount > MAX_ROWS)
      throwParseError({
        code: "empty_file",
        message: `الورقة ${sheet.name} تتجاوز 10000 صف`,
      })

    let currentLabel: string | null = null
    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r)
      if (!rowHasContent(row)) continue
      if (isHeaderRow(sheet, resolveCell, r)) continue

      const apartment = resolveCell(r, COL_APARTMENT)
      const label = deriveApartmentLabel(apartment, towerPrefix)
      const typeValue = readCell(row.getCell(COL_TYPE).value)

      if (label !== null) {
        currentLabel = label
        if (!groups.has(currentLabel)) {
          const client = resolveCell(r, COL_CLIENT)
          groups.set(currentLabel, {
            label: currentLabel,
            client_name: typeof client === "string" ? client.trim() : "",
            totalRow: null,
            sheet,
          })
          order.push(currentLabel)
        }
      }

      if (currentLabel === null) continue

      const g = groups.get(currentLabel)
      if (!g) continue

      if (isTotalRow(typeValue)) {
        if (g.totalRow !== null) {
          throwParseError({
            code: "duplicate_total",
            message: `الشقة ${currentLabel} تحتوي على أكثر من صف "الإجمالي"`,
            label: currentLabel,
          })
        }
        g.totalRow = r
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
    const total = extractTotalFromRow(g.sheet.getRow(g.totalRow))
    if (total === null) {
      throwParseError({
        code: "no_numeric_total",
        message: `الشقة ${label}: صف "الإجمالي" لا يحتوي على قيمة رقمية`,
        label,
      })
    }
    result.push({ label: g.label, client_name: g.client_name, total })
  }

  return result
}

export function isExcelParseError(e: unknown): e is ParseError {
  return isParseError(e)
}
