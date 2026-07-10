"use server"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Buffer } from "node:buffer"

import { requireRole } from "@/lib/server/auth-helpers"
import { processPendingMessages } from "@/lib/server/batch-processing"
import { db } from "./db"
import {
  deriveTowerPrefix,
  getSheetNames,
  isExcelParseError,
  parseInvoiceExcel,
} from "./excel-parser"
import type { BatchStatus } from "./schema"
import {
  apartmentContacts,
  apartments,
  batchSessions,
  contacts,
  invoices,
  messages,
  phoneNumbers,
  projects,
  towers,
} from "./schema"
import { renderNotification, renderWarning } from "./template-renderer"

const now = sql`(datetime('now'))`

async function invokeBackgroundProcess(batchId: number): Promise<void> {
  const isNetlify = Boolean(process.env.NETLIFY)
  const url = isNetlify
    ? `/.netlify/functions/process-batch-background`
    : `http://localhost:3000/api/batches/${batchId}/process`
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batchId }),
    })
  } catch {
    await processPendingMessages(batchId)
  }
}

export type BatchRow = {
  id: number
  title: string
  projectId: number
  projectTitle: string
  status: BatchStatus
  sent: number
  failed: number
  createdAt: string | null
}

export async function listBatches(params?: {
  page?: number
  status?: "all" | BatchStatus
  includeArchived?: boolean
  projectId?: number | null
}): Promise<{
  rows: BatchRow[]
  page: number
  totalPages: number
  total: number
}> {
  await requireRole("operator")
  const page = params?.page && params.page > 0 ? params.page : 1
  const status: "all" | BatchStatus =
    params?.status === "draft" ||
    params?.status === "sending" ||
    params?.status === "completed"
      ? params.status
      : "all"
  const includeArchived = params?.includeArchived === true
  const projectId =
    typeof params?.projectId === "number" ? params.projectId : null
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const conditions = [isNull(batchSessions.deletedAt)]
  if (!includeArchived) {
    conditions.push(isNull(batchSessions.archivedAt))
  }
  if (status !== "all") {
    conditions.push(eq(batchSessions.status, status))
  }
  if (projectId !== null) {
    conditions.push(eq(batchSessions.projectId, projectId))
  }

  const rows = await db
    .select({
      id: batchSessions.id,
      title: batchSessions.title,
      projectId: batchSessions.projectId,
      projectTitle: projects.title,
      status: batchSessions.status,
      sent: batchSessions.sent,
      failed: batchSessions.failed,
      createdAt: batchSessions.createdAt,
    })
    .from(batchSessions)
    .innerJoin(projects, eq(batchSessions.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(sql`${batchSessions.createdAt} DESC`)
    .limit(pageSize)
    .offset(offset)

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(batchSessions)
    .innerJoin(projects, eq(batchSessions.projectId, projects.id))
    .where(and(...conditions))
  const total = countRows[0]?.count ?? 0

  return {
    rows: rows satisfies BatchRow[],
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    total,
  }
}

export async function listProjectsForBatch(): Promise<
  { id: number; title: string }[]
> {
  await requireRole("operator")
  const rows = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(projects.title)
  return rows
}

export async function listTowersForBatch(
  projectId: number
): Promise<{ id: number; label: string }[]> {
  await requireRole("operator")
  const rows = await db
    .select({ id: towers.id, label: towers.label })
    .from(towers)
    .where(and(eq(towers.projectId, projectId), isNull(towers.deletedAt)))
    .orderBy(towers.label)
  return rows
}

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

export type PreviewContact = {
  contactId: number
  contactName: string
  role: string
  phoneNumbers: string[]
}

export type PreviewMatched = {
  apartmentId: number
  label: string
  clientName: string
  total: number
  contacts: PreviewContact[]
}

export type PreviewNoContact = {
  apartmentId: number
  label: string
  clientName: string
  total: number
}

export type BatchPreview = {
  batchId: number
  matched: PreviewMatched[]
  noContacts: PreviewNoContact[]
}

export type CreateBatchError =
  | { ok: false; error: "unmatched"; unmatched: string[] }
  | { ok: false; error: "parse"; message: string }
  | { ok: false; error: "invalid_project" }
  | { ok: false; error: "empty_parse" }

export type CreateBatchResult = ({ ok: true } & BatchPreview) | CreateBatchError

export async function createBatch(
  formData: FormData
): Promise<CreateBatchResult> {
  if (!(formData instanceof FormData)) throw new Error("متوقع FormData")
  const title = formData.get("title")
  const projectId = formData.get("projectId")
  const file = formData.get("file")
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("العنوان مطلوب")
  }
  const pid = Number(projectId)
  if (Number.isNaN(pid)) throw new Error("معرّف المشروع مطلوب")
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
    "application/octet-stream",
  ]
  if (!allowedMime.includes(file.type)) {
    return {
      ok: false,
      error: "parse",
      message: "نوع الملف غير مدعوم. يجب أن يكون ملف Excel",
    } as const
  }

  const user = await requireRole("operator")

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, pid), isNull(projects.deletedAt)))
    .limit(1)
  if (projectRows.length === 0) {
    return { ok: false, error: "invalid_project" } as const
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

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

  let parsed
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
  if (unmatched.length > 0) {
    return { ok: false, error: "unmatched", unmatched } as const
  }

  const [batch] = await db
    .insert(batchSessions)
    .values({
      title: title.trim(),
      projectId: pid,
      status: "draft",
      createdBy: user.id,
    })
    .returning({ id: batchSessions.id })

  const matchedApartmentIds = apartmentRows.map((a) => a.id)
  const linkRows = await db
    .select({
      apartmentId: apartmentContacts.apartmentId,
      contactId: apartmentContacts.contactId,
      contactName: contacts.fullname,
      role: apartmentContacts.role,
      isNotificationRecipient: apartmentContacts.isNotificationRecipient,
    })
    .from(apartmentContacts)
    .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
    .where(
      and(
        inArray(apartmentContacts.apartmentId, matchedApartmentIds),
        isNull(apartmentContacts.deletedAt),
        isNull(contacts.deletedAt),
        eq(apartmentContacts.isNotificationRecipient, true)
      )
    )

  const contactIds = linkRows.map((l) => l.contactId)
  const phoneRows =
    contactIds.length === 0
      ? []
      : await db
          .select({
            contactId: phoneNumbers.contactId,
            number: phoneNumbers.number,
          })
          .from(phoneNumbers)
          .where(
            and(
              inArray(phoneNumbers.contactId, contactIds),
              isNull(phoneNumbers.deletedAt)
            )
          )
          .orderBy(phoneNumbers.number)

  const phonesByContact = new Map<number, string[]>()
  for (const p of phoneRows) {
    const list = phonesByContact.get(p.contactId) ?? []
    list.push(p.number)
    phonesByContact.set(p.contactId, list)
  }

  const contactsByApartment = new Map<
    number,
    Array<{
      contactId: number
      contactName: string
      role: string
      phoneNumbers: string[]
    }>
  >()
  for (const l of linkRows) {
    const list = contactsByApartment.get(l.apartmentId) ?? []
    list.push({
      contactId: l.contactId,
      contactName: l.contactName,
      role: l.role,
      phoneNumbers: phonesByContact.get(l.contactId) ?? [],
    })
    contactsByApartment.set(l.apartmentId, list)
  }

  const matched: PreviewMatched[] = []
  const noContacts: PreviewNoContact[] = []
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
    const aptContacts = contactsByApartment.get(apt.id) ?? []
    const withPhones = aptContacts.filter((c) => c.phoneNumbers.length > 0)
    if (withPhones.length === 0) {
      noContacts.push({
        apartmentId: apt.id,
        label: p.label,
        clientName: p.client_name,
        total: p.total,
      })
    } else {
      matched.push({
        apartmentId: apt.id,
        label: p.label,
        clientName: p.client_name,
        total: p.total,
        contacts: withPhones,
      })
      invoiceInserts.push({
        batchId: batch.id,
        apartmentId: apt.id,
        clientName: p.client_name,
        total: p.total,
        createdBy: user.id,
      })
    }
  }

  if (invoiceInserts.length > 0) {
    await db.insert(invoices).values(invoiceInserts)
  }

  return {
    ok: true,
    batchId: batch.id,
    matched,
    noContacts,
  } as const
}

export type BatchDetail = {
  id: number
  title: string
  projectId: number
  projectTitle: string
  status: BatchStatus
  sent: number
  failed: number
  createdAt: string | null
}

export async function getBatch(input: {
  id: number
}): Promise<BatchDetail | null> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const id = (input as { id?: unknown }).id
  if (typeof id !== "number") throw new Error("المعرّف مطلوب")
  await requireRole("operator")
  const rows = await db
    .select({
      id: batchSessions.id,
      title: batchSessions.title,
      projectId: batchSessions.projectId,
      projectTitle: projects.title,
      status: batchSessions.status,
      sent: batchSessions.sent,
      failed: batchSessions.failed,
      createdAt: batchSessions.createdAt,
    })
    .from(batchSessions)
    .innerJoin(projects, eq(batchSessions.projectId, projects.id))
    .where(and(eq(batchSessions.id, id), isNull(batchSessions.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export type DraftPreviewMatched = {
  invoiceId: number
  apartmentId: number
  label: string
  clientName: string
  total: number
  contacts: PreviewContact[]
}

export type DraftPreview = {
  matched: DraftPreviewMatched[]
  noContacts: PreviewNoContact[]
}

export async function getDraftPreview(input: {
  batchId: number
}): Promise<DraftPreview | null> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  await requireRole("operator")
  const batchRows = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "draft"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) return null

  const invoiceRows = await db
    .select({
      id: invoices.id,
      apartmentId: invoices.apartmentId,
      label: apartments.label,
      clientName: invoices.clientName,
      total: invoices.total,
    })
    .from(invoices)
    .innerJoin(apartments, eq(invoices.apartmentId, apartments.id))
    .where(eq(invoices.batchId, batchId))
    .orderBy(apartments.label)

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  if (apartmentIds.length === 0) {
    return { matched: [], noContacts: [] } satisfies DraftPreview
  }

  const linkRows = await db
    .select({
      apartmentId: apartmentContacts.apartmentId,
      contactId: apartmentContacts.contactId,
      contactName: contacts.fullname,
      role: apartmentContacts.role,
    })
    .from(apartmentContacts)
    .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
    .where(
      and(
        inArray(apartmentContacts.apartmentId, apartmentIds),
        isNull(apartmentContacts.deletedAt),
        isNull(contacts.deletedAt),
        eq(apartmentContacts.isNotificationRecipient, true)
      )
    )

  const contactIds = linkRows.map((l) => l.contactId)
  const phoneRows =
    contactIds.length === 0
      ? []
      : await db
          .select({
            contactId: phoneNumbers.contactId,
            number: phoneNumbers.number,
          })
          .from(phoneNumbers)
          .where(
            and(
              inArray(phoneNumbers.contactId, contactIds),
              isNull(phoneNumbers.deletedAt)
            )
          )
          .orderBy(phoneNumbers.number)

  const phonesByContact = new Map<number, string[]>()
  for (const p of phoneRows) {
    const list = phonesByContact.get(p.contactId) ?? []
    list.push(p.number)
    phonesByContact.set(p.contactId, list)
  }

  const contactsByApartment = new Map<
    number,
    Array<{
      contactId: number
      contactName: string
      role: string
      phoneNumbers: string[]
    }>
  >()
  for (const l of linkRows) {
    const list = contactsByApartment.get(l.apartmentId) ?? []
    list.push({
      contactId: l.contactId,
      contactName: l.contactName,
      role: l.role,
      phoneNumbers: phonesByContact.get(l.contactId) ?? [],
    })
    contactsByApartment.set(l.apartmentId, list)
  }

  const matched: DraftPreviewMatched[] = []
  const noContacts: PreviewNoContact[] = []
  for (const inv of invoiceRows) {
    const invContacts = contactsByApartment.get(inv.apartmentId) ?? []
    const withPhones = invContacts.filter((c) => c.phoneNumbers.length > 0)
    if (withPhones.length === 0) {
      noContacts.push({
        apartmentId: inv.apartmentId,
        label: inv.label,
        clientName: inv.clientName,
        total: inv.total,
      })
    } else {
      matched.push({
        invoiceId: inv.id,
        apartmentId: inv.apartmentId,
        label: inv.label,
        clientName: inv.clientName,
        total: inv.total,
        contacts: withPhones,
      })
    }
  }

  return { matched, noContacts } satisfies DraftPreview
}

export async function softDeleteBatch(input: {
  id: number
}): Promise<{ ok: true; data: { id: number } } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const id = (input as { id?: unknown }).id
  if (typeof id !== "number") throw new Error("المعرّف مطلوب")
  const user = await requireRole("operator")
  const rows = await db
    .update(batchSessions)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(
      and(
        eq(batchSessions.id, id),
        eq(batchSessions.status, "draft"),
        isNull(batchSessions.deletedAt)
      )
    )
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return {
      ok: false,
      error: "لا يمكن حذف الدفعة (غير موجودة أو ليست مسودة)",
    } as const
  }
  await db.delete(invoices).where(eq(invoices.batchId, id))
  return { ok: true, data: rows[0] } as const
}

export async function archiveBatch(input: {
  id: number
}): Promise<{ ok: true; data: { id: number } } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const id = (input as { id?: unknown }).id
  if (typeof id !== "number") throw new Error("المعرّف مطلوب")
  const user = await requireRole("operator")
  const rows = await db
    .update(batchSessions)
    .set({ archivedAt: now, updatedBy: user.id, updatedAt: now })
    .where(
      and(
        eq(batchSessions.id, id),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt),
        isNull(batchSessions.archivedAt)
      )
    )
    .returning({ id: batchSessions.id })
  if (rows.length === 0) {
    return {
      ok: false,
      error: "لا يمكن أرشفة الدفعة (غير موجودة أو ليست مكتملة)",
    } as const
  }
  return { ok: true, data: rows[0] } as const
}

export async function sendBatch(input: {
  batchId: number
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  const user = await requireRole("operator")

  const batchRows = await db
    .select({ id: batchSessions.id, projectId: batchSessions.projectId })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "draft"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير موجودة أو ليست مسودة" } as const
  }

  const invoiceRows = await db
    .select({
      id: invoices.id,
      apartmentId: invoices.apartmentId,
      clientName: invoices.clientName,
      total: invoices.total,
    })
    .from(invoices)
    .where(eq(invoices.batchId, batchId))

  if (invoiceRows.length === 0) {
    return { ok: false, error: "لا توجد فواتير في هذه الدفعة" } as const
  }

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const linkRows = await db
    .select({
      apartmentId: apartmentContacts.apartmentId,
      contactId: apartmentContacts.contactId,
    })
    .from(apartmentContacts)
    .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
    .where(
      and(
        inArray(apartmentContacts.apartmentId, apartmentIds),
        isNull(apartmentContacts.deletedAt),
        isNull(contacts.deletedAt),
        eq(apartmentContacts.isNotificationRecipient, true)
      )
    )

  const contactIds = linkRows.map((l) => l.contactId)
  const phoneRows =
    contactIds.length === 0
      ? []
      : await db
          .select({
            id: phoneNumbers.id,
            contactId: phoneNumbers.contactId,
            number: phoneNumbers.number,
          })
          .from(phoneNumbers)
          .where(
            and(
              inArray(phoneNumbers.contactId, contactIds),
              isNull(phoneNumbers.deletedAt)
            )
          )

  const phonesByContact = new Map<number, typeof phoneRows>()
  for (const p of phoneRows) {
    const list = phonesByContact.get(p.contactId) ?? []
    list.push(p)
    phonesByContact.set(p.contactId, list)
  }

  const phonesByApartment = new Map<number, typeof phoneRows>()
  for (const l of linkRows) {
    const phones = phonesByContact.get(l.contactId) ?? []
    const existing = phonesByApartment.get(l.apartmentId) ?? []
    for (const p of phones) {
      if (!existing.some((e) => e.id === p.id)) existing.push(p)
    }
    phonesByApartment.set(l.apartmentId, existing)
  }

  const apartmentLabels = new Map<number, string>(
    apartmentIds.map((aid) => [aid, ""])
  )
  const aptLabelRows = await db
    .select({ id: apartments.id, label: apartments.label })
    .from(apartments)
    .where(inArray(apartments.id, apartmentIds))
  for (const a of aptLabelRows) apartmentLabels.set(a.id, a.label)

  const messageInserts: Array<{
    invoiceId: number
    phoneNumberId: number
    contents: string
    templateType: "notification"
    status: "pending"
    createdBy: number
  }> = []
  for (const inv of invoiceRows) {
    const label = apartmentLabels.get(inv.apartmentId) ?? ""
    const body = renderNotification({ amount: inv.total, unit_label: label })
    const phones = phonesByApartment.get(inv.apartmentId) ?? []
    for (const p of phones) {
      messageInserts.push({
        invoiceId: inv.id,
        phoneNumberId: p.id,
        contents: body,
        templateType: "notification",
        status: "pending",
        createdBy: user.id,
      })
    }
  }

  if (messageInserts.length === 0) {
    return { ok: false, error: "لا توجد أرقام هاتف للإرسال" } as const
  }

  await db.insert(messages).values(messageInserts)

  await db
    .update(batchSessions)
    .set({ status: "sending", updatedBy: user.id, updatedAt: now })
    .where(eq(batchSessions.id, batchId))

  await invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}

export type BatchStatusMessage = {
  id: number
  apartmentLabel: string
  contactName: string | null
  phoneNumber: string
  templateType: "notification" | "warning"
  status: "pending" | "sent" | "failed"
  errorReason: string | null
  sentAt: string | null
}

export type BatchStatusResponse = {
  status: BatchStatus
  sent: number
  failed: number
  total: number
  messages: BatchStatusMessage[]
}

export async function getBatchStatus(input: {
  batchId: number
}): Promise<BatchStatusResponse | null> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  await requireRole("operator")

  const batchRows = await db
    .select({
      status: batchSessions.status,
      sent: batchSessions.sent,
      failed: batchSessions.failed,
    })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)
  if (batchRows.length === 0) return null

  const batch = batchRows[0]

  const messageRows = await db
    .select({
      id: messages.id,
      apartmentLabel: apartments.label,
      contactName: contacts.fullname,
      phoneNumber: phoneNumbers.number,
      templateType: messages.templateType,
      status: messages.status,
      errorReason: messages.errorReason,
      sentAt: messages.sentAt,
    })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .innerJoin(apartments, eq(invoices.apartmentId, apartments.id))
    .innerJoin(phoneNumbers, eq(messages.phoneNumberId, phoneNumbers.id))
    .leftJoin(contacts, eq(phoneNumbers.contactId, contacts.id))
    .where(eq(invoices.batchId, batchId))
    .orderBy(messages.id)

  const total = messageRows.length
  return {
    status: batch.status,
    sent: batch.sent,
    failed: batch.failed,
    total,
    messages: messageRows satisfies BatchStatusMessage[],
  } satisfies BatchStatusResponse
}

export async function retryFailed(input: {
  batchId: number
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  const user = await requireRole("operator")

  const batchRows = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير مكتملة" } as const
  }

  const failedRows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(eq(invoices.batchId, batchId), eq(messages.status, "failed")))

  if (failedRows.length === 0) {
    return { ok: false, error: "لا توجد رسائل فاشلة" } as const
  }

  await db
    .update(messages)
    .set({ status: "pending", errorReason: null, updatedAt: now })
    .where(
      inArray(
        messages.id,
        failedRows.map((m) => m.id)
      )
    )

  await db
    .update(batchSessions)
    .set({ status: "sending", updatedBy: user.id, updatedAt: now })
    .where(eq(batchSessions.id, batchId))

  await invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}

export type WarningEligibleInvoice = {
  invoiceId: number
  apartmentId: number
  label: string
  clientName: string
  total: number
}

export async function getWarningEligible(input: {
  batchId: number
}): Promise<WarningEligibleInvoice[] | null> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  await requireRole("operator")

  const batchRows = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) return null

  const invoiceRows = await db
    .select({
      id: invoices.id,
      apartmentId: invoices.apartmentId,
      label: apartments.label,
      clientName: invoices.clientName,
      total: invoices.total,
    })
    .from(invoices)
    .innerJoin(apartments, eq(invoices.apartmentId, apartments.id))
    .where(eq(invoices.batchId, batchId))
    .orderBy(apartments.label)

  const invoiceIds = invoiceRows.map((i) => i.id)
  if (invoiceIds.length === 0) return []

  const warningRows = await db
    .select({ invoiceId: messages.invoiceId })
    .from(messages)
    .where(
      and(
        inArray(messages.invoiceId, invoiceIds),
        eq(messages.templateType, "warning")
      )
    )

  const withWarning = new Set(warningRows.map((w) => w.invoiceId))
  return invoiceRows
    .filter((i) => !withWarning.has(i.id))
    .map((i) => ({
      invoiceId: i.id,
      apartmentId: i.apartmentId,
      label: i.label,
      clientName: i.clientName,
      total: i.total,
    })) satisfies WarningEligibleInvoice[]
}

export async function sendWarning(input: {
  batchId: number
  invoiceIds: number[]
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  const batchId = (input as { batchId?: unknown }).batchId
  const invoiceIds = (input as { invoiceIds?: unknown }).invoiceIds
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  if (
    !Array.isArray(invoiceIds) ||
    !invoiceIds.every((id) => typeof id === "number")
  ) {
    throw new Error("معرّفات الفواتير مطلوبة")
  }
  const user = await requireRole("operator")

  const batchRows = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.id, batchId),
        eq(batchSessions.status, "completed"),
        isNull(batchSessions.deletedAt)
      )
    )
    .limit(1)
  if (batchRows.length === 0) {
    return { ok: false, error: "الدفعة غير مكتملة" } as const
  }

  if (invoiceIds.length === 0) {
    return { ok: false, error: "لم يتم اختيار فواتير" } as const
  }

  let invoiceRows = await db
    .select({
      id: invoices.id,
      apartmentId: invoices.apartmentId,
      total: invoices.total,
    })
    .from(invoices)
    .where(and(eq(invoices.batchId, batchId), inArray(invoices.id, invoiceIds)))

  if (invoiceRows.length === 0) {
    return { ok: false, error: "الفواتير غير موجودة" } as const
  }

  const existingWarnings = await db
    .select({ invoiceId: messages.invoiceId })
    .from(messages)
    .where(
      and(
        inArray(messages.invoiceId, invoiceIds),
        eq(messages.templateType, "warning")
      )
    )
  if (existingWarnings.length > 0) {
    const alreadyWarned = new Set(existingWarnings.map((w) => w.invoiceId))
    const validInvoices = invoiceRows.filter((i) => !alreadyWarned.has(i.id))
    if (validInvoices.length === 0) {
      return {
        ok: false,
        error: "تم إرسال تحذيرات لهذه الفواتير بالفعل",
      } as const
    }
    invoiceRows = validInvoices
  }

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const linkRows = await db
    .select({
      apartmentId: apartmentContacts.apartmentId,
      contactId: apartmentContacts.contactId,
    })
    .from(apartmentContacts)
    .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
    .where(
      and(
        inArray(apartmentContacts.apartmentId, apartmentIds),
        isNull(apartmentContacts.deletedAt),
        isNull(contacts.deletedAt),
        eq(apartmentContacts.isNotificationRecipient, true)
      )
    )

  const contactIds = linkRows.map((l) => l.contactId)
  const phoneRows =
    contactIds.length === 0
      ? []
      : await db
          .select({
            id: phoneNumbers.id,
            contactId: phoneNumbers.contactId,
            number: phoneNumbers.number,
          })
          .from(phoneNumbers)
          .where(
            and(
              inArray(phoneNumbers.contactId, contactIds),
              isNull(phoneNumbers.deletedAt)
            )
          )

  const phonesByContact = new Map<number, typeof phoneRows>()
  for (const p of phoneRows) {
    const list = phonesByContact.get(p.contactId) ?? []
    list.push(p)
    phonesByContact.set(p.contactId, list)
  }

  const phonesByApartment = new Map<number, typeof phoneRows>()
  for (const l of linkRows) {
    const phones = phonesByContact.get(l.contactId) ?? []
    const existing = phonesByApartment.get(l.apartmentId) ?? []
    for (const p of phones) {
      if (!existing.some((e) => e.id === p.id)) existing.push(p)
    }
    phonesByApartment.set(l.apartmentId, existing)
  }

  const aptLabelRows = await db
    .select({ id: apartments.id, label: apartments.label })
    .from(apartments)
    .where(inArray(apartments.id, apartmentIds))
  const apartmentLabels = new Map(aptLabelRows.map((a) => [a.id, a.label]))

  const messageInserts: Array<{
    invoiceId: number
    phoneNumberId: number
    contents: string
    templateType: "warning"
    status: "pending"
    createdBy: number
  }> = []
  for (const inv of invoiceRows) {
    const label = apartmentLabels.get(inv.apartmentId) ?? ""
    const body = renderWarning({ amount: inv.total, unit_label: label })
    const phones = phonesByApartment.get(inv.apartmentId) ?? []
    for (const p of phones) {
      messageInserts.push({
        invoiceId: inv.id,
        phoneNumberId: p.id,
        contents: body,
        templateType: "warning",
        status: "pending",
        createdBy: user.id,
      })
    }
  }

  if (messageInserts.length === 0) {
    return { ok: false, error: "لا توجد أرقام هاتف للإرسال" } as const
  }

  await db.insert(messages).values(messageInserts)

  await db
    .update(batchSessions)
    .set({ status: "sending", updatedBy: user.id, updatedAt: now })
    .where(eq(batchSessions.id, batchId))

  await invokeBackgroundProcess(batchId)

  return { ok: true, batchId } as const
}
