import { sql } from "drizzle-orm"

export const now = sql`(datetime('now'))`

export type ParsedInvoice = {
  label: string
  client_name: string
  total: number
}

export type BatchParseStats = {
  skippedCreditCount: number
  skippedTinyCount: number
  duplicateCount: number
}

export function encodeParseStats(stats: BatchParseStats): string {
  return JSON.stringify(stats)
}

export function decodeParseStats(raw: string | null): BatchParseStats {
  if (!raw)
    return { skippedCreditCount: 0, skippedTinyCount: 0, duplicateCount: 0 }
  try {
    const parsed = JSON.parse(raw) as Partial<BatchParseStats>
    return {
      skippedCreditCount: parsed.skippedCreditCount ?? 0,
      skippedTinyCount: parsed.skippedTinyCount ?? 0,
      duplicateCount: parsed.duplicateCount ?? 0,
    }
  } catch {
    return { skippedCreditCount: 0, skippedTinyCount: 0, duplicateCount: 0 }
  }
}

export function validateInvoiceTotal(
  total: unknown
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof total !== "number" || Number.isNaN(total))
    return { ok: false, error: "المبلغ غير صالح" }
  if (!Number.isFinite(total)) return { ok: false, error: "المبلغ غير صالح" }
  if (total < 0) return { ok: false, error: "المبلغ يجب أن يكون غير سالب" }
  if (total > 9_999_999.99)
    return { ok: false, error: "المبلغ أكبر من الحد الأقصى المسموح" }
  return { ok: true, value: Math.round(total * 100) / 100 }
}
