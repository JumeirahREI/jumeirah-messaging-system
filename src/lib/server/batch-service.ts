import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Buffer } from "node:buffer"

import { requireRole } from "./auth.server"
import { db } from "./db"
import { isExcelParseError, parseInvoiceExcel } from "./excel-parser"
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
} from "./schema"
import { getSmsGateway } from "./sms-gateway"
import { renderNotification } from "./template-renderer"

const now = sql`(datetime('now'))`

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

export const listBatches = createServerFn({ method: "GET" }).handler(
  async () => {
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
      .where(
        and(isNull(batchSessions.deletedAt), isNull(batchSessions.archivedAt))
      )
      .orderBy(sql`${batchSessions.createdAt} DESC`)
    return rows satisfies BatchRow[]
  }
)

export const listProjectsForBatch = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireRole("operator")
    const rows = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(projects.title)
    return rows
  }
)

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

export const createBatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("متوقع FormData")
    const title = input.get("title")
    const projectId = input.get("projectId")
    const file = input.get("file")
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new Error("العنوان مطلوب")
    }
    const pid = Number(projectId)
    if (Number.isNaN(pid)) throw new Error("معرّف المشروع مطلوب")
    if (!(file instanceof File)) throw new Error("الملف مطلوب")
    return { title: title.trim(), projectId: pid, file }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("operator")

    const projectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), isNull(projects.deletedAt)))
      .limit(1)
    if (projectRows.length === 0) {
      return { ok: false, error: "invalid_project" } as const
    }

    const arrayBuffer = await data.file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    let parsed
    try {
      parsed = await parseInvoiceExcel(buffer)
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
          eq(apartments.projectId, data.projectId),
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
        title: data.title,
        projectId: data.projectId,
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
          clientName: p.clientName,
          total: p.total,
        })
      } else {
        matched.push({
          apartmentId: apt.id,
          label: p.label,
          clientName: p.clientName,
          total: p.total,
          contacts: withPhones,
        })
        invoiceInserts.push({
          batchId: batch.id,
          apartmentId: apt.id,
          clientName: p.clientName,
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
  })

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

export const getBatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
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
      .where(
        and(eq(batchSessions.id, data.id), isNull(batchSessions.deletedAt))
      )
      .limit(1)
    return rows.length > 0 ? rows[0] : null
  })

export type PreviewInvoiceRow = {
  id: number
  apartmentId: number
  apartmentLabel: string
  clientName: string
  total: number
}

export const listBatchInvoices = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const batchId = (input as { batchId?: unknown }).batchId
    if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
    return { batchId }
  })
  .handler(async ({ data }) => {
    await requireRole("operator")
    const rows = await db
      .select({
        id: invoices.id,
        apartmentId: invoices.apartmentId,
        apartmentLabel: apartments.label,
        clientName: invoices.clientName,
        total: invoices.total,
      })
      .from(invoices)
      .innerJoin(apartments, eq(invoices.apartmentId, apartments.id))
      .where(eq(invoices.batchId, data.batchId))
      .orderBy(apartments.label)
    return rows satisfies PreviewInvoiceRow[]
  })

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

export const getDraftPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const batchId = (input as { batchId?: unknown }).batchId
    if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
    return { batchId }
  })
  .handler(async ({ data }) => {
    await requireRole("operator")
    const batchRows = await db
      .select({ id: batchSessions.id })
      .from(batchSessions)
      .where(
        and(
          eq(batchSessions.id, data.batchId),
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
      .where(eq(invoices.batchId, data.batchId))
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
  })

export const softDeleteBatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("operator")
    const rows = await db
      .update(batchSessions)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(
        and(
          eq(batchSessions.id, data.id),
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
    return { ok: true, data: rows[0] } as const
  })

export const sendBatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const batchId = (input as { batchId?: unknown }).batchId
    if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
    return { batchId }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("operator")

    const batchRows = await db
      .select({ id: batchSessions.id, projectId: batchSessions.projectId })
      .from(batchSessions)
      .where(
        and(
          eq(batchSessions.id, data.batchId),
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
      .where(eq(invoices.batchId, data.batchId))

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
      .where(eq(batchSessions.id, data.batchId))

    await processPendingMessages(data.batchId)

    return { ok: true, batchId: data.batchId } as const
  })

export async function processPendingMessages(batchId: number): Promise<void> {
  const gateway = getSmsGateway()

  const pendingRows = await db
    .select({
      id: messages.id,
      phoneNumberId: messages.phoneNumberId,
      contents: messages.contents,
    })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(eq(invoices.batchId, batchId), eq(messages.status, "pending")))

  for (const m of pendingRows) {
    const phoneRow = await db
      .select({ number: phoneNumbers.number })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.id, m.phoneNumberId))
      .limit(1)
    const to = phoneRow.length > 0 ? phoneRow[0].number : ""
    if (!to) {
      await db
        .update(messages)
        .set({
          status: "failed",
          errorReason: "رقم الهاتف غير موجود",
          updatedAt: now,
        })
        .where(eq(messages.id, m.id))
      continue
    }

    const result = await gateway.send(to, m.contents)
    if (result.ok) {
      await db
        .update(messages)
        .set({ status: "sent", sentAt: now, updatedAt: now })
        .where(eq(messages.id, m.id))
    } else {
      await db
        .update(messages)
        .set({ status: "failed", errorReason: result.error, updatedAt: now })
        .where(eq(messages.id, m.id))
    }
  }

  await refreshBatchCounters(batchId)
}

async function refreshBatchCounters(batchId: number): Promise<void> {
  const sentCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(eq(invoices.batchId, batchId), eq(messages.status, "sent")))
  const failedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(eq(invoices.batchId, batchId), eq(messages.status, "failed")))
  const pendingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(and(eq(invoices.batchId, batchId), eq(messages.status, "pending")))

  const sent = sentCount[0]?.count ?? 0
  const failed = failedCount[0]?.count ?? 0
  const pending = pendingCount[0]?.count ?? 0

  const status: BatchStatus = pending === 0 ? "completed" : "sending"
  await db
    .update(batchSessions)
    .set({ sent, failed, status, updatedAt: now })
    .where(eq(batchSessions.id, batchId))
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

export const getBatchStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const batchId = (input as { batchId?: unknown }).batchId
    if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
    return { batchId }
  })
  .handler(async ({ data }) => {
    await requireRole("operator")

    const batchRows = await db
      .select({
        status: batchSessions.status,
        sent: batchSessions.sent,
        failed: batchSessions.failed,
      })
      .from(batchSessions)
      .where(
        and(eq(batchSessions.id, data.batchId), isNull(batchSessions.deletedAt))
      )
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
      .where(eq(invoices.batchId, data.batchId))
      .orderBy(messages.id)

    const total = messageRows.length
    return {
      status: batch.status,
      sent: batch.sent,
      failed: batch.failed,
      total,
      messages: messageRows satisfies BatchStatusMessage[],
    } satisfies BatchStatusResponse
  })

export const retryFailed = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const batchId = (input as { batchId?: unknown }).batchId
    if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
    return { batchId }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("operator")

    const batchRows = await db
      .select({ id: batchSessions.id })
      .from(batchSessions)
      .where(
        and(
          eq(batchSessions.id, data.batchId),
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
      .where(
        and(eq(invoices.batchId, data.batchId), eq(messages.status, "failed"))
      )

    if (failedRows.length === 0) {
      return { ok: false, error: "لا توجد رسائل فاشلة" } as const
    }

    for (const m of failedRows) {
      await db
        .update(messages)
        .set({ status: "pending", errorReason: null, updatedAt: now })
        .where(eq(messages.id, m.id))
    }

    await db
      .update(batchSessions)
      .set({ status: "sending", updatedBy: user.id, updatedAt: now })
      .where(eq(batchSessions.id, data.batchId))

    await processPendingMessages(data.batchId)

    return { ok: true, batchId: data.batchId } as const
  })
