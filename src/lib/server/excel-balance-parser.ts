import type { Row, Worksheet } from "exceljs"
import ExcelJS from "exceljs"
import type { Buffer } from "node:buffer"

import type { ParsedInvoice } from "./excel-parser"

const { Workbook } = ExcelJS

export type { ParsedInvoice }

export type SkippedRow = {
  label: string
  clientName: string
  amount: number
}

export type BalanceParseResult = {
  invoices: ParsedInvoice[]
  skippedCredit: SkippedRow[]
  skippedTiny: SkippedRow[]
}

export type BalanceParseError = {
  code: "empty_file" | "no_customer_rows"
  message: string
}

const TINY_THRESHOLD = 1.0

const COL_NUMBER = 1
const COL_CLIENT = 2
const COL_DEBIT = 5
const COL_CREDIT = 6

const LABEL_TOKEN = /[A-Za-z]+\d[\w-]*/g
const APARTMENT_MARKER = "شقة رقم"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_SHEETS = 50
const MAX_ROWS = 10000

function isBalanceError(e: unknown): e is BalanceParseError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as BalanceParseError).code === "string" &&
    typeof (e as BalanceParseError).message === "string"
  )
}

function throwParseError(err: BalanceParseError): never {
  const error = new Error(err.message) as Error & BalanceParseError
  error.code = err.code
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

function rowHasContent(row: Row): boolean {
  let hasContent = false
  row.eachCell({ includeEmpty: false }, (cell) => {
    const v = readCell(cell.value)
    if (v !== null && v !== "") hasContent = true
  })
  return hasContent
}

function extractLabel(clientRaw: string): string | null {
  const matches = [...clientRaw.matchAll(LABEL_TOKEN)].map((m) => m[0])
  if (matches.length === 0) return null
  return matches[matches.length - 1]
}

function cleanClientName(clientRaw: string, label: string): string {
  let cleaned = clientRaw
  const markerIdx = cleaned.indexOf(APARTMENT_MARKER)
  if (markerIdx !== -1) cleaned = cleaned.slice(0, markerIdx)
  cleaned = cleaned.replace(label, "")
  return cleaned.replace(/[\s\u0640]+/g, " ").trim()
}

function numericOrZero(value: CellValue): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function classifyRow(
  label: string,
  clientName: string,
  debit: number,
  credit: number,
  invoices: ParsedInvoice[],
  skippedCredit: SkippedRow[],
  skippedTiny: SkippedRow[]
): void {
  if (debit > 0) {
    if (debit < TINY_THRESHOLD) {
      skippedTiny.push({ label, clientName, amount: debit })
    } else {
      invoices.push({ label, client_name: clientName, total: debit })
    }
    return
  }
  if (credit > 0) {
    skippedCredit.push({ label, clientName, amount: credit })
    return
  }
  skippedTiny.push({ label, clientName, amount: 0 })
}

function parseSheet(sheet: Worksheet, result: BalanceParseResult): void {
  const rowCount = sheet.rowCount
  if (rowCount === 0) return
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r)
    if (!rowHasContent(row)) continue

    const numberValue = readCell(row.getCell(COL_NUMBER).value)
    if (
      typeof numberValue !== "number" ||
      !Number.isFinite(numberValue) ||
      numberValue <= 0
    ) {
      continue
    }

    const clientRaw = readCell(row.getCell(COL_CLIENT).value)
    if (typeof clientRaw !== "string" || clientRaw.trim().length === 0) continue

    const label = extractLabel(clientRaw.trim())
    if (!label) continue

    const clientName = cleanClientName(clientRaw.trim(), label)
    const debit = numericOrZero(readCell(row.getCell(COL_DEBIT).value))
    const credit = numericOrZero(readCell(row.getCell(COL_CREDIT).value))
    classifyRow(
      label,
      clientName,
      debit,
      credit,
      result.invoices,
      result.skippedCredit,
      result.skippedTiny
    )
  }
}

export async function parseBalanceSheetExcel(
  buffer: Buffer
): Promise<BalanceParseResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throwParseError({
      code: "empty_file",
      message: "حجم الملف يتجاوز 10 ميجابايت",
    })
  }
  const workbook = new Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  if (workbook.worksheets.length === 0) {
    throwParseError({
      code: "empty_file",
      message: "الملف لا يحتوي على أي ورقة بيانات",
    })
  }
  if (workbook.worksheets.length > MAX_SHEETS) {
    throwParseError({ code: "empty_file", message: "عدد الأوراق يتجاوز 50" })
  }

  const result: BalanceParseResult = {
    invoices: [],
    skippedCredit: [],
    skippedTiny: [],
  }

  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > MAX_ROWS) {
      throwParseError({
        code: "empty_file",
        message: `الورقة ${sheet.name} تتجاوز 10000 صف`,
      })
    }
    parseSheet(sheet, result)
  }

  if (result.invoices.length === 0) {
    throwParseError({
      code: "no_customer_rows",
      message: "لم يتم العثور على صفوف عملاء برصيد مدين في الملف",
    })
  }

  return result
}

export function isBalanceParseError(e: unknown): e is BalanceParseError {
  return isBalanceError(e)
}
