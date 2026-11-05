"use server"
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm"
import { extractLocalNumber, toStorageFormat } from "@/lib/phone"
import {
  contactLinkSchema,
  contactSchema,
  contactUpdateSchema,
} from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import type { ContactRole } from "@/lib/server/schema"
import {
  apartmentContacts,
  apartments,
  contacts,
  phoneNumbers,
  projects,
  towers,
} from "@/lib/server/schema"
import { actor, now, safeMutation, type MutationResult } from "./shared"

export type ContactRow = { id: number; fullname: string }

export async function listContacts(): Promise<ContactRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({ id: contacts.id, fullname: contacts.fullname })
    .from(contacts)
    .where(isNull(contacts.deletedAt))
    .orderBy(contacts.fullname)
  return rows satisfies ContactRow[]
}

export async function createContact(input: {
  fullname: string
  phone?: string
}): Promise<MutationResult<{ id: number; fullname: string }>> {
  const user = await requireRoleRateLimited("operator")
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(contacts)
      .values({ fullname: parsed.data.fullname, ...actor(user) })
      .returning({ id: contacts.id, fullname: contacts.fullname })
    if (parsed.data.phone) {
      const local = extractLocalNumber(parsed.data.phone)
      await db.insert(phoneNumbers).values({
        contactId: row.id,
        number: toStorageFormat(local),
        ...actor(user),
      })
    }
    return { ok: true, data: row } as const
  })
}

export async function getContact(input: {
  id: number
}): Promise<{ id: number; fullname: string; createdAt: string | null } | null> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: contacts.id,
      fullname: contacts.fullname,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(eq(contacts.id, input.id), isNull(contacts.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function updateContact(input: {
  id: number
  fullname: string
}): Promise<MutationResult<{ id: number; fullname: string }>> {
  const user = await requireRoleRateLimited("operator")
  const parsed = contactUpdateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(contacts)
      .set({
        fullname: parsed.data.fullname,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(and(eq(contacts.id, parsed.data.id), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id, fullname: contacts.fullname })
    if (row.length === 0)
      return { ok: false, error: "جهة الاتصال غير موجودة" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function softDeleteContact(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("operator")
  const result = await db
    .update(contacts)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(contacts.id, input.id), isNull(contacts.deletedAt)))
    .returning({ id: contacts.id })
  if (result.length === 0) {
    return { ok: false, error: "جهة الاتصال غير موجودة" } as const
  }
  await db
    .update(phoneNumbers)
    .set({ deletedAt: now })
    .where(
      and(eq(phoneNumbers.contactId, input.id), isNull(phoneNumbers.deletedAt))
    )
  await db
    .update(apartmentContacts)
    .set({ deletedAt: now })
    .where(
      and(
        eq(apartmentContacts.contactId, input.id),
        isNull(apartmentContacts.deletedAt)
      )
    )
  return { ok: true, data: result[0] } as const
}

export type ContactWithCountsRow = ContactRow & {
  phoneCount: number
  apartmentCount: number
  createdAt: string | null
}

export async function listContactsPage(params?: {
  q?: string
  projectId?: number | null
  page?: number
  pageSize?: number
}): Promise<{
  rows: ContactWithCountsRow[]
  page: number
  totalPages: number
  total: number
}> {
  await requireRole("operator")
  const q = params?.q?.trim() ?? ""
  const projectId =
    typeof params?.projectId === "number" ? params.projectId : null
  const pageSize =
    params?.pageSize && params.pageSize > 0 ? params.pageSize : 20
  const page = params?.page && params.page > 0 ? params.page : 1
  const offset = (page - 1) * pageSize

  const conditions = [isNull(contacts.deletedAt)]
  if (q.length > 0) {
    conditions.push(like(contacts.fullname, `%${q}%`))
  }
  if (projectId !== null) {
    const projectContactIds = db
      .select({ id: apartmentContacts.contactId })
      .from(apartmentContacts)
      .innerJoin(apartments, eq(apartmentContacts.apartmentId, apartments.id))
      .where(
        and(
          eq(apartments.projectId, projectId),
          isNull(apartmentContacts.deletedAt),
          isNull(apartments.deletedAt)
        )
      )
    conditions.push(inArray(contacts.id, projectContactIds))
  }

  const phoneCountSq = db
    .select({ c: sql<number>`count(*)` })
    .from(phoneNumbers)
    .where(
      and(
        eq(phoneNumbers.contactId, contacts.id),
        isNull(phoneNumbers.deletedAt)
      )
    )
  const aptCountSq = db
    .select({ c: sql<number>`count(*)` })
    .from(apartmentContacts)
    .where(
      and(
        eq(apartmentContacts.contactId, contacts.id),
        isNull(apartmentContacts.deletedAt)
      )
    )

  const rows = await db
    .select({
      id: contacts.id,
      fullname: contacts.fullname,
      createdAt: contacts.createdAt,
      phoneCount: sql<number>`(${phoneCountSq})`,
      apartmentCount: sql<number>`(${aptCountSq})`,
    })
    .from(contacts)
    .where(and(...conditions))
    .orderBy(contacts.fullname)
    .limit(pageSize)
    .offset(offset)

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(and(...conditions))
  const total = countRows[0]?.count ?? 0

  return {
    rows: rows satisfies ContactWithCountsRow[],
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    total,
  }
}

export type ContactApartmentLinkRow = {
  id: number
  apartmentId: number
  apartmentLabel: string
  towerLabel: string
  projectTitle: string
  projectId: number
  role: ContactRole
  isNotificationRecipient: boolean
}

export async function listContactApartmentLinks(input: {
  contactId: number
}): Promise<ContactApartmentLinkRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: apartmentContacts.id,
      apartmentId: apartmentContacts.apartmentId,
      apartmentLabel: apartments.label,
      towerLabel: towers.label,
      projectTitle: projects.title,
      projectId: apartments.projectId,
      role: apartmentContacts.role,
      isNotificationRecipient: apartmentContacts.isNotificationRecipient,
    })
    .from(apartmentContacts)
    .innerJoin(apartments, eq(apartmentContacts.apartmentId, apartments.id))
    .innerJoin(towers, eq(apartments.towerId, towers.id))
    .innerJoin(projects, eq(apartments.projectId, projects.id))
    .where(
      and(
        eq(apartmentContacts.contactId, input.contactId),
        isNull(apartmentContacts.deletedAt),
        isNull(apartments.deletedAt)
      )
    )
    .orderBy(projects.title, apartments.label)
  return rows satisfies ContactApartmentLinkRow[]
}

export type ApartmentContactRow = {
  id: number
  contactId: number
  contactName: string
  role: ContactRole
  isNotificationRecipient: boolean
}

export async function listApartmentContacts(input: {
  apartmentId: number
}): Promise<ApartmentContactRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: apartmentContacts.id,
      contactId: apartmentContacts.contactId,
      contactName: contacts.fullname,
      role: apartmentContacts.role,
      isNotificationRecipient: apartmentContacts.isNotificationRecipient,
    })
    .from(apartmentContacts)
    .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
    .where(
      and(
        eq(apartmentContacts.apartmentId, input.apartmentId),
        isNull(apartmentContacts.deletedAt),
        isNull(contacts.deletedAt)
      )
    )
    .orderBy(contacts.fullname)
  return rows satisfies ApartmentContactRow[]
}

export async function linkContact(input: {
  apartmentId: number
  contactId: number
  role: ContactRole
  isNotificationRecipient: boolean
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("operator")
  const parsed = contactLinkSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(apartmentContacts)
      .values({
        apartmentId: parsed.data.apartmentId,
        contactId: parsed.data.contactId ?? 0,
        role: parsed.data.role,
        isNotificationRecipient: parsed.data.isNotificationRecipient,
        ...actor(user),
      })
      .returning({ id: apartmentContacts.id })
    return { ok: true, data: row } as const
  })
}

export async function updateContactLink(input: {
  id: number
  role: ContactRole
  isNotificationRecipient: boolean
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("operator")
  return safeMutation(async () => {
    const row = await db
      .update(apartmentContacts)
      .set({
        role: input.role,
        isNotificationRecipient: input.isNotificationRecipient,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(apartmentContacts.id, input.id),
          isNull(apartmentContacts.deletedAt)
        )
      )
      .returning({ id: apartmentContacts.id })
    if (row.length === 0)
      return { ok: false, error: "الربط غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function unlinkContact(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("operator")
  const result = await db
    .update(apartmentContacts)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(
      and(
        eq(apartmentContacts.id, input.id),
        isNull(apartmentContacts.deletedAt)
      )
    )
    .returning({ id: apartmentContacts.id })
  if (result.length === 0) {
    return { ok: false, error: "الربط غير موجود" } as const
  }
  return { ok: true, data: result[0] } as const
}
