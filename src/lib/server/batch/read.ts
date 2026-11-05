"use server"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireRole } from "@/lib/server/auth-helpers"
import { parseBatchIdInput, parseIdInput } from "@/lib/server/action-guards"
import { computeReconciliation } from "@/lib/server/batch-reconciliation"
import { db } from "@/lib/server/db"
import type { BatchMode, BatchStatus } from "@/lib/server/schema"
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
} from "@/lib/server/schema"
import { decodeParseStats } from "./shared"

export type BatchRow = {
  id: number
  title: string
  projectId: number
  projectTitle: string
  status: BatchStatus
  mode: BatchMode
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
      mode: batchSessions.mode,
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

export type PreviewContact = {
  contactId: number
  contactName: string
  role: string
  phoneNumbers: string[]
}

export type PreviewNoContact = {
  invoiceId: number
  apartmentId: number
  label: string
  clientName: string
  total: number
}

export type BatchDetail = {
  id: number
  title: string
  projectId: number
  projectTitle: string
  status: BatchStatus
  mode: BatchMode
  sent: number
  failed: number
  createdAt: string | null
}

export async function getBatch(input: {
  id: number
}): Promise<BatchDetail | null> {
  const id = parseIdInput(input)
  await requireRole("operator")
  const rows = await db
    .select({
      id: batchSessions.id,
      title: batchSessions.title,
      projectId: batchSessions.projectId,
      projectTitle: projects.title,
      status: batchSessions.status,
      mode: batchSessions.mode,
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

export type DraftPreviewMissing = {
  label: string
  towerLabel: string
}

export type DraftPreview = {
  matched: DraftPreviewMatched[]
  noContacts: PreviewNoContact[]
  unmatched: string[]
  missing: DraftPreviewMissing[]
  coverage: { matched: number; total: number }
  skippedCreditCount: number
  skippedTinyCount: number
  duplicateCount: number
}

export async function getDraftPreview(input: {
  batchId: number
}): Promise<DraftPreview | null> {
  const batchId = parseBatchIdInput(input)
  await requireRole("operator")
  const batchRows = await db
    .select({
      id: batchSessions.id,
      projectId: batchSessions.projectId,
      excelLabels: batchSessions.excelLabels,
      parseStats: batchSessions.parseStats,
      mode: batchSessions.mode,
    })
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
  const batchRow = batchRows[0]
  const stats = decodeParseStats(batchRow.parseStats)
  if (batchRow.mode === "manual") {
    return {
      matched: [],
      noContacts: [],
      unmatched: [],
      missing: [],
      coverage: { matched: 0, total: 0 },
      skippedCreditCount: 0,
      skippedTinyCount: 0,
      duplicateCount: 0,
    }
  }

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
    .where(and(eq(invoices.batchId, batchId), isNull(invoices.deletedAt)))
    .orderBy(apartments.label)

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const excelLabels: string[] = batchRow.excelLabels
    ? (JSON.parse(batchRow.excelLabels) as string[])
    : []
  const allProjectApts = await db
    .select({
      id: apartments.id,
      label: apartments.label,
      towerLabel: towers.label,
    })
    .from(apartments)
    .innerJoin(towers, eq(apartments.towerId, towers.id))
    .where(
      and(
        eq(apartments.projectId, batchRow.projectId),
        isNull(apartments.deletedAt)
      )
    )
    .orderBy(apartments.label)
  const { unmatched, missing } = computeReconciliation(
    excelLabels,
    allProjectApts.map(({ label, towerLabel }) => ({ label, towerLabel }))
  )
  const emailableAptIds = await db
    .select({ apartmentId: apartmentContacts.apartmentId })
    .from(apartmentContacts)
    .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
    .innerJoin(phoneNumbers, eq(phoneNumbers.contactId, contacts.id))
    .where(
      and(
        inArray(
          apartmentContacts.apartmentId,
          allProjectApts.map((a) => a.id)
        ),
        eq(apartmentContacts.isNotificationRecipient, true),
        isNull(apartmentContacts.deletedAt),
        isNull(contacts.deletedAt),
        isNull(phoneNumbers.deletedAt)
      )
    )
    .groupBy(apartmentContacts.apartmentId)
  const emailableSet = new Set(emailableAptIds.map((r) => r.apartmentId))
  const excelLabelSet = new Set(excelLabels)
  const coverage = {
    matched: allProjectApts.filter(
      (a) => emailableSet.has(a.id) && excelLabelSet.has(a.label)
    ).length,
    total: allProjectApts.length,
  }
  if (apartmentIds.length === 0) {
    return {
      matched: [],
      noContacts: [],
      unmatched,
      missing,
      coverage,
      skippedCreditCount: stats.skippedCreditCount,
      skippedTinyCount: stats.skippedTinyCount,
      duplicateCount: stats.duplicateCount,
    } satisfies DraftPreview
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
        invoiceId: inv.id,
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

  return {
    matched,
    noContacts,
    unmatched,
    missing,
    coverage,
    skippedCreditCount: stats.skippedCreditCount,
    skippedTinyCount: stats.skippedTinyCount,
    duplicateCount: stats.duplicateCount,
  } satisfies DraftPreview
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
  const batchId = parseBatchIdInput(input)
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
    .where(
      and(
        eq(invoices.batchId, batchId),
        isNull(invoices.deletedAt),
        isNull(messages.deletedAt)
      )
    )
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
  const batchId = parseBatchIdInput(input)
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
    .where(and(eq(invoices.batchId, batchId), isNull(invoices.deletedAt)))
    .orderBy(apartments.label)

  const invoiceIds = invoiceRows.map((i) => i.id)
  if (invoiceIds.length === 0) return []

  const [warningRows, notifiedRows] = await Promise.all([
    db
      .select({ invoiceId: messages.invoiceId })
      .from(messages)
      .where(
        and(
          inArray(messages.invoiceId, invoiceIds),
          eq(messages.templateType, "warning"),
          isNull(messages.deletedAt)
        )
      ),
    db
      .select({ invoiceId: messages.invoiceId })
      .from(messages)
      .where(
        and(
          inArray(messages.invoiceId, invoiceIds),
          eq(messages.templateType, "notification"),
          eq(messages.status, "sent"),
          isNull(messages.deletedAt)
        )
      ),
  ])

  const withWarning = new Set(warningRows.map((w) => w.invoiceId))
  const withSentNotification = new Set(notifiedRows.map((n) => n.invoiceId))
  return invoiceRows
    .filter((i) => !withWarning.has(i.id) && withSentNotification.has(i.id))
    .map((i) => ({
      invoiceId: i.id,
      apartmentId: i.apartmentId,
      label: i.label,
      clientName: i.clientName,
      total: i.total,
    })) satisfies WarningEligibleInvoice[]
}

export type ManualDraftInvoice = {
  invoiceId: number
  apartmentId: number
  label: string
  clientName: string
  total: number
  hasContacts: boolean
}

export async function getManualDraftInvoices(input: {
  batchId: number
}): Promise<ManualDraftInvoice[] | null> {
  const batchId = parseBatchIdInput(input)
  await requireRole("operator")

  const batchRows = await db
    .select({ id: batchSessions.id, mode: batchSessions.mode })
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
  if (batchRows[0].mode !== "manual") return []

  const invoiceRows = await db
    .select({
      invoiceId: invoices.id,
      apartmentId: invoices.apartmentId,
      clientName: invoices.clientName,
      total: invoices.total,
    })
    .from(invoices)
    .where(and(eq(invoices.batchId, batchId), isNull(invoices.deletedAt)))

  if (invoiceRows.length === 0) return []

  const apartmentIds = invoiceRows.map((i) => i.apartmentId)
  const labelRows = await db
    .select({ id: apartments.id, label: apartments.label })
    .from(apartments)
    .where(inArray(apartments.id, apartmentIds))
  const labels = new Map(labelRows.map((r) => [r.id, r.label]))

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
          .select({ contactId: phoneNumbers.contactId })
          .from(phoneNumbers)
          .where(
            and(
              inArray(phoneNumbers.contactId, contactIds),
              isNull(phoneNumbers.deletedAt)
            )
          )
  const contactsWithPhones = new Set(phoneRows.map((p) => p.contactId))
  const aptsWithContacts = new Set<number>()
  for (const l of linkRows) {
    if (contactsWithPhones.has(l.contactId)) {
      aptsWithContacts.add(l.apartmentId)
    }
  }

  return invoiceRows.map((inv) => ({
    invoiceId: inv.invoiceId,
    apartmentId: inv.apartmentId,
    label: labels.get(inv.apartmentId) ?? `#${inv.apartmentId}`,
    clientName: inv.clientName,
    total: inv.total,
    hasContacts: aptsWithContacts.has(inv.apartmentId),
  }))
}
