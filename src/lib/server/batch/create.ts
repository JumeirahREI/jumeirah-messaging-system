"use server"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Buffer } from "node:buffer"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import {
  BalanceParseResult,
  MAX_FILE_SIZE,
  parseBalanceSheetExcel,
} from "@/lib/server/excel-balance-parser"
import {
  deriveTowerPrefix,
  getSheetNames,
  isExcelParseError,
  parseInvoiceExcel,
} from "@/lib/server/excel-parser"
import {
  apartments,
  batchSessions,
  invoices,
  projects,
  towers,
} from "@/lib/server/schema"
import { now, ParsedInvoice, encodeParseStats } from "./shared"

export type SheetPreviewTower = { id: number; label: string }

export type SheetPreviewResult =
  | {
      ok: true
      sheets: string[]
      towers: SheetPreviewTower[]
      autoMapping: Record<number, string | null>
    }
  | { ok: false; error: string }

export async function previewBatchFile(
  formData: FormData
): Promise<SheetPreviewResult> {
  const projectId = formData.get("projectId")
  const file = formData.get("file")
  const pid = Number(projectId)
  if (Number.isNaN(pid)) return { ok: false, error: "معرّف المشروع مطلوب" }
  if (!(file instanceof File)) return { ok: false, error: "الملف مطلوب" }

  await requireRole("operator")

  const towerRows = await db
    .select({ id: towers.id, label: towers.label })
    .from(towers)
    .where(and(eq(towers.projectId, pid), isNull(towers.deletedAt)))
    .orderBy(towers.label)

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { fileTypeFromBuffer } = await import("file-type")
  const detected = await fileTypeFromBuffer(buffer)
  if (
    !detected ||
    detected.mime !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return { ok: false, error: "الملف ليس ملف Excel صالح" }
  }

  let sheets: string[]
  try {
    sheets = await getSheetNames(buffer)
  } catch {
    return { ok: false, error: "تعذّر قراءة أوراق الملف" }
  }

  const autoMapping: Record<number, string | null> = {}
  for (const tower of towerRows) {
    const matched = sheets.find((s) => deriveTowerPrefix(s) === tower.label)
    autoMapping[tower.id] = matched ?? null
  }

  return { ok: true, sheets, towers: towerRows, autoMapping }
}

function parseError(message: string): CreateBatchError {
  return { ok: false, error: "parse", message } as const
}

export type BatchPreview = {
  batchId: number
  unmatchedCount: number
  missingCount: number
  skippedCreditCount: number
  skippedTinyCount: number
  duplicateCount: number
}

export type CreateBatchError =
  | { ok: false; error: "parse"; message: string }
  | { ok: false; error: "invalid_project" }
  | { ok: false; error: "empty_parse" }
  | { ok: false; error: "empty_project" }

export type CreateBatchResult = ({ ok: true } & BatchPreview) | CreateBatchError

async function createAutomaticInvoices(
  formData: FormData,
  pid: number,
  userId: number,
  batchId: number
): Promise<CreateBatchResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) throw new Error("الملف مطلوب")

  if (file.size > 10 * 1024 * 1024) {
    return {
      ok: false,
      error: "parse",
      message: "حجم الملف يتجاوز 10 ميجابايت",
    } as const
  }
  const allowedMime = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]
  if (!allowedMime.includes(file.type)) {
    return {
      ok: false,
      error: "parse",
      message: "نوع الملف غير مدعوم. يجب أن يكون ملف Excel",
    } as const
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { fileTypeFromBuffer } = await import("file-type")
  const detected = await fileTypeFromBuffer(buffer)
  if (
    !detected ||
    detected.mime !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return {
      ok: false,
      error: "parse",
      message: "الملف ليس ملف Excel صالح",
    } as const
  }

  const sheetMappingRaw = formData.get("sheetMapping")
  let sheetTowerMap: Map<string, string> | undefined
  if (typeof sheetMappingRaw === "string" && sheetMappingRaw.length > 0) {
    const parsedMapping = JSON.parse(sheetMappingRaw) as Record<string, string>
    const towerIds = Object.keys(parsedMapping).map(Number)
    if (towerIds.length > 0) {
      const towerRows = await db
        .select({ id: towers.id, label: towers.label })
        .from(towers)
        .where(
          and(
            eq(towers.projectId, pid),
            inArray(towers.id, towerIds),
            isNull(towers.deletedAt)
          )
        )
      const towerLabelById = new Map(towerRows.map((t) => [t.id, t.label]))
      sheetTowerMap = new Map()
      for (const [towerIdStr, sheetName] of Object.entries(parsedMapping)) {
        const towerLabel = towerLabelById.get(Number(towerIdStr))
        if (towerLabel) sheetTowerMap.set(sheetName, towerLabel)
      }
    }
  }

  let parsed: ParsedInvoice[]
  try {
    parsed = await parseInvoiceExcel(buffer, sheetTowerMap)
  } catch (e) {
    if (isExcelParseError(e)) {
      return {
        ok: false,
        error: "parse",
        message: e.message,
      } as const
    }
    return {
      ok: false,
      error: "parse",
      message: e instanceof Error ? e.message : "خطأ في تحليل الملف",
    } as const
  }
  if (parsed.length === 0) {
    return { ok: false, error: "empty_parse" } as const
  }

  const labels = parsed.map((p) => p.label)
  const apartmentRows = await db
    .select({
      id: apartments.id,
      label: apartments.label,
      projectId: apartments.projectId,
    })
    .from(apartments)
    .where(
      and(
        eq(apartments.projectId, pid),
        isNull(apartments.deletedAt),
        inArray(apartments.label, labels)
      )
    )

  const apartmentByLabel = new Map(apartmentRows.map((a) => [a.label, a]))
  const unmatched: string[] = []
  for (const p of parsed) {
    if (!apartmentByLabel.has(p.label)) unmatched.push(p.label)
  }

  const excelLabelSet = new Set(labels)
  const allProjectApartments = await db
    .select({ label: apartments.label })
    .from(apartments)
    .where(and(eq(apartments.projectId, pid), isNull(apartments.deletedAt)))
  const missingCount = allProjectApartments.filter(
    (a) => !excelLabelSet.has(a.label)
  ).length

  await db
    .update(batchSessions)
    .set({ excelLabels: JSON.stringify(labels) })
    .where(eq(batchSessions.id, batchId))

  const invoiceInserts: Array<{
    batchId: number
    apartmentId: number
    clientName: string
    total: number
    createdBy: number
  }> = []
  for (const p of parsed) {
    const apt = apartmentByLabel.get(p.label)
    if (!apt) continue
    invoiceInserts.push({
      batchId,
      apartmentId: apt.id,
      clientName: p.client_name,
      total: p.total,
      createdBy: userId,
    })
  }

  if (invoiceInserts.length > 0) {
    await db.insert(invoices).values(invoiceInserts)
  }

  return {
    ok: true,
    batchId,
    unmatchedCount: unmatched.length,
    missingCount,
    skippedCreditCount: 0,
    skippedTinyCount: 0,
    duplicateCount: 0,
  } as const
}

async function createBalanceInvoices(
  formData: FormData,
  pid: number,
  userId: number,
  batchId: number
): Promise<CreateBatchResult> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return parseError("ملف رصيد واحد على الأقل مطلوب")
  }

  const allowedMime = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return parseError("حجم الملف يتجاوز 10 ميجابايت")
    }
    if (!allowedMime.includes(file.type)) {
      return parseError("نوع الملف غير مدعوم. يجب أن يكون ملف Excel")
    }
  }

  const allInvoices: ParsedInvoice[] = []
  const seenLabels = new Set<string>()
  const duplicates: string[] = []
  let skippedCreditCount = 0
  let skippedTinyCount = 0

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { fileTypeFromBuffer } = await import("file-type")
    const detected = await fileTypeFromBuffer(buffer)
    if (
      !detected ||
      detected.mime !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return parseError("الملف ليس ملف Excel صالح")
    }

    let parsed: BalanceParseResult
    try {
      parsed = await parseBalanceSheetExcel(buffer)
    } catch (e) {
      const message = e instanceof Error ? e.message : "خطأ في تحليل الملف"
      return parseError(message)
    }

    skippedCreditCount += parsed.skippedCredit.length
    skippedTinyCount += parsed.skippedTiny.length
    for (const inv of parsed.invoices) {
      if (seenLabels.has(inv.label)) {
        duplicates.push(inv.label)
        continue
      }
      seenLabels.add(inv.label)
      allInvoices.push(inv)
    }
  }

  if (allInvoices.length === 0) {
    return { ok: false, error: "empty_parse" } as const
  }

  const labels = allInvoices.map((p) => p.label)
  const apartmentRows = await db
    .select({
      id: apartments.id,
      label: apartments.label,
      projectId: apartments.projectId,
    })
    .from(apartments)
    .where(
      and(
        eq(apartments.projectId, pid),
        isNull(apartments.deletedAt),
        inArray(apartments.label, labels)
      )
    )

  const apartmentByLabel = new Map(apartmentRows.map((a) => [a.label, a]))
  const unmatched: string[] = []
  for (const p of allInvoices) {
    if (!apartmentByLabel.has(p.label)) unmatched.push(p.label)
  }

  if (unmatched.length > 0) {
    await db
      .update(batchSessions)
      .set({ deletedBy: userId, deletedAt: now })
      .where(eq(batchSessions.id, batchId))
    const shown = unmatched.slice(0, 20).join("، ")
    const suffix = unmatched.length > 20 ? ` … (${unmatched.length})` : ""
    return {
      ok: false,
      error: "parse",
      message: `تسميات شقق غير مطابقة: ${shown}${suffix}`,
    } as const
  }

  const excelLabelSet = new Set(labels)
  const allProjectApartments = await db
    .select({ label: apartments.label })
    .from(apartments)
    .where(and(eq(apartments.projectId, pid), isNull(apartments.deletedAt)))
  const missingCount = allProjectApartments.filter(
    (a) => !excelLabelSet.has(a.label)
  ).length

  await db
    .update(batchSessions)
    .set({
      excelLabels: JSON.stringify(labels),
      parseStats: encodeParseStats({
        skippedCreditCount,
        skippedTinyCount,
        duplicateCount: duplicates.length,
      }),
    })
    .where(eq(batchSessions.id, batchId))

  const invoiceInserts = allInvoices.map((p) => ({
    batchId,
    // Safe: unmatched labels returned early above, so every label is in the map.
    apartmentId: apartmentByLabel.get(p.label)!.id,
    clientName: p.client_name,
    total: p.total,
    createdBy: userId,
  }))
  await db.insert(invoices).values(invoiceInserts)

  return {
    ok: true,
    batchId,
    unmatchedCount: 0,
    missingCount,
    skippedCreditCount,
    skippedTinyCount,
    duplicateCount: duplicates.length,
  } as const
}

async function createManualInvoices(
  pid: number,
  userId: number,
  batchId: number
): Promise<CreateBatchResult> {
  const apartmentRows = await db
    .select({ id: apartments.id })
    .from(apartments)
    .where(and(eq(apartments.projectId, pid), isNull(apartments.deletedAt)))

  if (apartmentRows.length === 0) {
    await db
      .update(batchSessions)
      .set({ deletedBy: userId, deletedAt: now })
      .where(eq(batchSessions.id, batchId))
    return { ok: false, error: "empty_project" } as const
  }

  const invoiceInserts = apartmentRows.map((a) => ({
    batchId,
    apartmentId: a.id,
    clientName: "",
    total: 0,
    createdBy: userId,
  }))

  await db.insert(invoices).values(invoiceInserts)

  return {
    ok: true,
    batchId,
    unmatchedCount: 0,
    missingCount: 0,
    skippedCreditCount: 0,
    skippedTinyCount: 0,
    duplicateCount: 0,
  } as const
}

export type BatchFormat = "balance" | "invoice"

export async function createBatch(
  formData: FormData
): Promise<CreateBatchResult> {
  if (!(formData instanceof FormData)) throw new Error("متوقع FormData")
  const title = formData.get("title")
  const projectId = formData.get("projectId")
  const modeRaw = formData.get("mode")
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("العنوان مطلوب")
  }
  const pid = Number(projectId)
  if (Number.isNaN(pid)) throw new Error("معرّف المشروع مطلوب")
  const mode: "automatic" | "manual" =
    modeRaw === "manual" ? "manual" : "automatic"
  const formatRaw = formData.get("format")
  const format: BatchFormat = formatRaw === "invoice" ? "invoice" : "balance"

  const user = await requireRoleRateLimited("operator")

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, pid), isNull(projects.deletedAt)))
    .limit(1)
  if (projectRows.length === 0) {
    return { ok: false, error: "invalid_project" } as const
  }

  const [batch] = await db
    .insert(batchSessions)
    .values({
      title: title.trim(),
      projectId: pid,
      status: "draft",
      mode,
      createdBy: user.id,
    })
    .returning({ id: batchSessions.id })

  if (mode === "manual") {
    return createManualInvoices(pid, user.id, batch.id)
  }
  if (format === "invoice") {
    return createAutomaticInvoices(formData, pid, user.id, batch.id)
  }
  return createBalanceInvoices(formData, pid, user.id, batch.id)
}
