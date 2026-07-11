"use server"
import bcrypt from "bcryptjs"
import { and, count, desc, eq, inArray, isNull, like, sql } from "drizzle-orm"

import {
  apartmentSchema,
  contactLinkSchema,
  contactSchema,
  contactUpdateSchema,
  phoneNumberSchema,
  projectSchema,
  towerSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/schemas"
import type { Role, SessionUser } from "@/lib/server/auth-helpers"
import { requireRole } from "@/lib/server/auth-helpers"
import { checkRateLimit, mutationLimiter } from "@/lib/server/rate-limit"
import { db } from "./db"
import type { ContactRole } from "./schema"
import {
  apartmentContacts,
  apartments,
  contacts,
  phoneNumbers,
  projects,
  towers,
  users,
} from "./schema"

const now = sql`(datetime('now'))`

type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string }

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /unique constraint|UNIQUE/i.test(e.message)
}

function safeMutation<T>(
  fn: () => Promise<MutationResult<T>>
): Promise<MutationResult<T>> {
  return fn().catch((e: unknown) => {
    if (isUniqueViolation(e)) {
      return { ok: false, error: "القيمة موجودة مسبقًا (تكرار غير مسموح)" }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
    }
  })
}

function actor(user: SessionUser) {
  return { createdBy: user.id, updatedBy: user.id }
}

async function requireRoleRateLimited(role: Role): Promise<SessionUser> {
  const user = await requireRole(role)
  const allowed = await checkRateLimit(mutationLimiter, `mutation:${user.id}`)
  if (!allowed) throw new Error("محاولات كثيرة. حاول مرة أخرى لاحقًا")
  return user
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectRow = {
  id: number
  title: string
  createdAt: string | null
}

export async function listProjects(): Promise<ProjectRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(desc(projects.createdAt))
  return rows satisfies ProjectRow[]
}

export type ProjectWithCountsRow = ProjectRow & {
  towerCount: number
  apartmentCount: number
}

export async function listProjectsWithCounts(): Promise<
  ProjectWithCountsRow[]
> {
  await requireRole("operator")
  const [projectsRows, towerCounts, aptCounts] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(desc(projects.createdAt)),
    db
      .select({ projectId: towers.projectId, n: count() })
      .from(towers)
      .where(isNull(towers.deletedAt))
      .groupBy(towers.projectId),
    db
      .select({ projectId: apartments.projectId, n: count() })
      .from(apartments)
      .where(isNull(apartments.deletedAt))
      .groupBy(apartments.projectId),
  ])
  const towerMap = new Map(towerCounts.map((r) => [r.projectId, r.n]))
  const aptMap = new Map(aptCounts.map((r) => [r.projectId, r.n]))
  return projectsRows.map((p) => ({
    ...p,
    towerCount: towerMap.get(p.id) ?? 0,
    apartmentCount: aptMap.get(p.id) ?? 0,
  }))
}

export async function getProject(input: {
  id: number
}): Promise<{ id: number; title: string } | null> {
  await requireRole("operator")
  const rows = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function createProject(input: {
  title: string
}): Promise<MutationResult<{ id: number; title: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = projectSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(projects)
      .values({ title: parsed.data.title, ...actor(user) })
      .returning({ id: projects.id, title: projects.title })
    return { ok: true, data: row } as const
  })
}

export async function updateProject(input: {
  id: number
  title: string
}): Promise<MutationResult<{ id: number; title: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = projectSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(projects)
      .set({ title: parsed.data.title, updatedBy: user.id, updatedAt: now })
      .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
      .returning({ id: projects.id, title: projects.title })
    if (row.length === 0)
      return { ok: false, error: "المشروع غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function softDeleteProject(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  const result = await db
    .update(projects)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
    .returning({ id: projects.id })
  if (result.length === 0) {
    return { ok: false, error: "المشروع غير موجود" } as const
  }

  const towerRows = await db
    .select({ id: towers.id })
    .from(towers)
    .where(and(eq(towers.projectId, input.id), isNull(towers.deletedAt)))
  const towerIds = towerRows.map((t) => t.id)
  if (towerIds.length > 0) {
    await db
      .update(towers)
      .set({ deletedAt: now })
      .where(inArray(towers.id, towerIds))

    const aptRows = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(
        and(inArray(apartments.towerId, towerIds), isNull(apartments.deletedAt))
      )
    const aptIds = aptRows.map((a) => a.id)
    if (aptIds.length > 0) {
      await db
        .update(apartments)
        .set({ deletedAt: now })
        .where(inArray(apartments.id, aptIds))
      await db
        .update(apartmentContacts)
        .set({ deletedAt: now })
        .where(inArray(apartmentContacts.apartmentId, aptIds))
    }
  }

  return { ok: true, data: result[0] } as const
}

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------

export type TowerRow = {
  id: number
  projectId: number
  label: string
  createdAt: string | null
}

export async function listTowers(input: {
  projectId: number
}): Promise<TowerRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: towers.id,
      projectId: towers.projectId,
      label: towers.label,
      createdAt: towers.createdAt,
    })
    .from(towers)
    .where(and(eq(towers.projectId, input.projectId), isNull(towers.deletedAt)))
    .orderBy(desc(towers.createdAt))
  return rows satisfies TowerRow[]
}

export type TowerWithCountsRow = TowerRow & { apartmentCount: number }

export async function listTowersWithCounts(input: {
  projectId: number
}): Promise<TowerWithCountsRow[]> {
  await requireRole("operator")
  const [towerRows, aptCounts] = await Promise.all([
    db
      .select({
        id: towers.id,
        projectId: towers.projectId,
        label: towers.label,
        createdAt: towers.createdAt,
      })
      .from(towers)
      .where(
        and(eq(towers.projectId, input.projectId), isNull(towers.deletedAt))
      )
      .orderBy(desc(towers.createdAt)),
    db
      .select({ towerId: apartments.towerId, n: count() })
      .from(apartments)
      .where(
        and(
          eq(apartments.projectId, input.projectId),
          isNull(apartments.deletedAt)
        )
      )
      .groupBy(apartments.towerId),
  ])
  const aptMap = new Map(aptCounts.map((r) => [r.towerId, r.n]))
  return towerRows.map((t) => ({
    ...t,
    apartmentCount: aptMap.get(t.id) ?? 0,
  }))
}

export async function getTower(input: {
  id: number
}): Promise<{ id: number; projectId: number; label: string } | null> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: towers.id,
      projectId: towers.projectId,
      label: towers.label,
    })
    .from(towers)
    .where(and(eq(towers.id, input.id), isNull(towers.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function createTower(input: {
  projectId: number
  label: string
}): Promise<MutationResult<{ id: number; projectId: number; label: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = towerSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(towers)
      .values({
        projectId: input.projectId,
        label: parsed.data.label,
        ...actor(user),
      })
      .returning({
        id: towers.id,
        projectId: towers.projectId,
        label: towers.label,
      })
    return { ok: true, data: row } as const
  })
}

export async function updateTower(input: {
  id: number
  label: string
}): Promise<MutationResult<{ id: number; label: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = towerSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(towers)
      .set({ label: parsed.data.label, updatedBy: user.id, updatedAt: now })
      .where(and(eq(towers.id, input.id), isNull(towers.deletedAt)))
      .returning({ id: towers.id, label: towers.label })
    if (row.length === 0)
      return { ok: false, error: "البرج غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function softDeleteTower(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  const result = await db
    .update(towers)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(towers.id, input.id), isNull(towers.deletedAt)))
    .returning({ id: towers.id })
  if (result.length === 0) {
    return { ok: false, error: "البرج غير موجود" } as const
  }

  const aptRows = await db
    .select({ id: apartments.id })
    .from(apartments)
    .where(and(eq(apartments.towerId, input.id), isNull(apartments.deletedAt)))
  const aptIds = aptRows.map((a) => a.id)
  if (aptIds.length > 0) {
    await db
      .update(apartments)
      .set({ deletedAt: now })
      .where(inArray(apartments.id, aptIds))
    await db
      .update(apartmentContacts)
      .set({ deletedAt: now })
      .where(inArray(apartmentContacts.apartmentId, aptIds))
  }

  return { ok: true, data: result[0] } as const
}

// ---------------------------------------------------------------------------
// Apartments
// ---------------------------------------------------------------------------

export type ApartmentRow = {
  id: number
  towerId: number
  projectId: number
  label: string
  unitNumber: string | null
  createdAt: string | null
}

export async function listApartments(input: {
  towerId: number
}): Promise<ApartmentRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: apartments.id,
      towerId: apartments.towerId,
      projectId: apartments.projectId,
      label: apartments.label,
      unitNumber: apartments.unitNumber,
      createdAt: apartments.createdAt,
    })
    .from(apartments)
    .where(
      and(eq(apartments.towerId, input.towerId), isNull(apartments.deletedAt))
    )
    .orderBy(apartments.label)
  return rows satisfies ApartmentRow[]
}

export type ApartmentWithTowerRow = ApartmentRow & { towerLabel: string }

export async function listApartmentsByProject(input: {
  projectId: number
}): Promise<ApartmentWithTowerRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: apartments.id,
      towerId: apartments.towerId,
      projectId: apartments.projectId,
      label: apartments.label,
      unitNumber: apartments.unitNumber,
      createdAt: apartments.createdAt,
      towerLabel: towers.label,
    })
    .from(apartments)
    .innerJoin(towers, eq(towers.id, apartments.towerId))
    .where(
      and(
        eq(apartments.projectId, input.projectId),
        isNull(apartments.deletedAt)
      )
    )
    .orderBy(apartments.label)
  return rows satisfies ApartmentWithTowerRow[]
}

export async function getApartment(input: { id: number }): Promise<{
  id: number
  towerId: number
  projectId: number
  label: string
  unitNumber: string | null
} | null> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: apartments.id,
      towerId: apartments.towerId,
      projectId: apartments.projectId,
      label: apartments.label,
      unitNumber: apartments.unitNumber,
    })
    .from(apartments)
    .where(and(eq(apartments.id, input.id), isNull(apartments.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function createApartment(input: {
  towerId: number
  projectId: number
  label: string
  unitNumber: string | null
}): Promise<
  MutationResult<{
    id: number
    towerId: number
    projectId: number
    label: string
    unitNumber: string | null
  }>
> {
  const user = await requireRoleRateLimited("admin")
  const parsed = apartmentSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(apartments)
      .values({
        towerId: parsed.data.towerId,
        projectId: input.projectId,
        label: parsed.data.label,
        unitNumber: parsed.data.unitNumber ?? null,
        ...actor(user),
      })
      .returning({
        id: apartments.id,
        towerId: apartments.towerId,
        projectId: apartments.projectId,
        label: apartments.label,
        unitNumber: apartments.unitNumber,
      })
    return { ok: true, data: row } as const
  })
}

export async function updateApartment(input: {
  id: number
  label: string
  unitNumber: string | null
}): Promise<
  MutationResult<{
    id: number
    label: string
    unitNumber: string | null
  }>
> {
  const user = await requireRoleRateLimited("admin")
  const parsed = apartmentSchema.safeParse({
    ...input,
    towerId: 1,
  })
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(apartments)
      .set({
        label: parsed.data.label,
        unitNumber: parsed.data.unitNumber ?? null,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(and(eq(apartments.id, input.id), isNull(apartments.deletedAt)))
      .returning({
        id: apartments.id,
        label: apartments.label,
        unitNumber: apartments.unitNumber,
      })
    if (row.length === 0)
      return { ok: false, error: "الشقة غير موجودة" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function softDeleteApartment(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  const result = await db
    .update(apartments)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(apartments.id, input.id), isNull(apartments.deletedAt)))
    .returning({ id: apartments.id })
  if (result.length === 0) {
    return { ok: false, error: "الشقة غير موجودة" } as const
  }

  await db
    .update(apartmentContacts)
    .set({ deletedAt: now })
    .where(
      and(
        eq(apartmentContacts.apartmentId, input.id),
        isNull(apartmentContacts.deletedAt)
      )
    )

  return { ok: true, data: result[0] } as const
}

// ---------------------------------------------------------------------------
// Contacts + apartment-contact links + phone numbers
// ---------------------------------------------------------------------------

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

export type PhoneNumberRow = {
  id: number
  contactId: number
  number: string
}

export async function listPhoneNumbers(input: {
  contactId: number
}): Promise<PhoneNumberRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: phoneNumbers.id,
      contactId: phoneNumbers.contactId,
      number: phoneNumbers.number,
    })
    .from(phoneNumbers)
    .where(
      and(
        eq(phoneNumbers.contactId, input.contactId),
        isNull(phoneNumbers.deletedAt)
      )
    )
    .orderBy(phoneNumbers.number)
  return rows satisfies PhoneNumberRow[]
}

export type ApartmentPhoneNumberRow = {
  id: number
  contactId: number
  number: string
}

export async function listPhoneNumbersForApartment(input: {
  apartmentId: number
}): Promise<ApartmentPhoneNumberRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: phoneNumbers.id,
      contactId: phoneNumbers.contactId,
      number: phoneNumbers.number,
    })
    .from(phoneNumbers)
    .innerJoin(
      apartmentContacts,
      eq(apartmentContacts.contactId, phoneNumbers.contactId)
    )
    .where(
      and(
        eq(apartmentContacts.apartmentId, input.apartmentId),
        isNull(apartmentContacts.deletedAt),
        isNull(phoneNumbers.deletedAt)
      )
    )
    .orderBy(phoneNumbers.number)
  return rows satisfies ApartmentPhoneNumberRow[]
}

export async function addPhoneNumber(input: {
  contactId: number
  number: string
}): Promise<MutationResult<{ id: number; contactId: number; number: string }>> {
  const user = await requireRoleRateLimited("operator")
  const parsed = phoneNumberSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "رقم غير صالح",
    }
  }
  return safeMutation(async () => {
    const [row] = await db
      .insert(phoneNumbers)
      .values({
        contactId: parsed.data.contactId,
        number: parsed.data.number,
        ...actor(user),
      })
      .returning({
        id: phoneNumbers.id,
        contactId: phoneNumbers.contactId,
        number: phoneNumbers.number,
      })
    return { ok: true, data: row } as const
  })
}

export async function updatePhoneNumber(input: {
  id: number
  number: string
}): Promise<MutationResult<{ id: number; number: string }>> {
  const user = await requireRoleRateLimited("operator")
  const parsed = phoneNumberSchema.safeParse({
    contactId: 0,
    number: input.number,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "رقم غير صالح",
    }
  }
  return safeMutation(async () => {
    const row = await db
      .update(phoneNumbers)
      .set({ number: parsed.data.number, updatedBy: user.id, updatedAt: now })
      .where(and(eq(phoneNumbers.id, input.id), isNull(phoneNumbers.deletedAt)))
      .returning({ id: phoneNumbers.id, number: phoneNumbers.number })
    if (row.length === 0)
      return { ok: false, error: "الرقم غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function deletePhoneNumber(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("operator")
  const result = await db
    .update(phoneNumbers)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(phoneNumbers.id, input.id), isNull(phoneNumbers.deletedAt)))
    .returning({ id: phoneNumbers.id })
  if (result.length === 0) {
    return { ok: false, error: "الرقم غير موجود" } as const
  }
  return { ok: true, data: result[0] } as const
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type UserRow = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
  mustResetPassword: boolean
  createdAt: string | null
}

export async function listUsers(): Promise<UserRow[]> {
  await requireRole("admin")
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
      mustResetPassword: users.mustResetPassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
  return rows satisfies UserRow[]
}

export async function getUser(input: { id: number }): Promise<{
  id: number
  fullname: string
  username: string
  isAdmin: boolean
  mustResetPassword: boolean
} | null> {
  await requireRole("admin")
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
      mustResetPassword: users.mustResetPassword,
    })
    .from(users)
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function createUser(input: {
  fullname: string
  username: string
  isAdmin: boolean
}): Promise<
  MutationResult<{
    id: number
    fullname: string
    username: string
    isAdmin: boolean
  }>
> {
  const user = await requireRoleRateLimited("admin")
  const parsed = userCreateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1)
  if (existing.length > 0) {
    return { ok: false, error: "اسم المستخدم مستخدم مسبقًا" } as const
  }
  return safeMutation(async () => {
    const hash = await bcrypt.hash(parsed.data.username, 12)
    const [row] = await db
      .insert(users)
      .values({
        fullname: parsed.data.fullname,
        username: parsed.data.username,
        password: hash,
        isAdmin: parsed.data.isAdmin,
        mustResetPassword: true,
        ...actor(user),
      })
      .returning({
        id: users.id,
        fullname: users.fullname,
        username: users.username,
        isAdmin: users.isAdmin,
      })
    return { ok: true, data: row } as const
  })
}

export async function updateUser(input: {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
}): Promise<
  MutationResult<{
    id: number
    fullname: string
    username: string
    isAdmin: boolean
  }>
> {
  const user = await requireRoleRateLimited("admin")
  const parsed = userUpdateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1)
  if (existing.length > 0 && existing[0].id !== parsed.data.id) {
    return { ok: false, error: "اسم المستخدم مستخدم مسبقًا" } as const
  }
  return safeMutation(async () => {
    if (parsed.data.isAdmin === false) {
      const target = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(and(eq(users.id, parsed.data.id), isNull(users.deletedAt)))
        .limit(1)
      if (target.length > 0 && target[0].isAdmin) {
        const adminCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.isAdmin, true), isNull(users.deletedAt)))
        if ((adminCount[0]?.count ?? 0) <= 1) {
          return {
            ok: false,
            error: "لا يمكن تخفيض صلاحيات آخر مسؤول",
          } as const
        }
      }
    }
    const row = await db
      .update(users)
      .set({
        fullname: parsed.data.fullname,
        username: parsed.data.username,
        isAdmin: parsed.data.isAdmin,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(and(eq(users.id, parsed.data.id), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        fullname: users.fullname,
        username: users.username,
        isAdmin: users.isAdmin,
      })
    if (row.length === 0)
      return { ok: false, error: "المستخدم غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function resetUserPassword(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  const existing = await db
    .select({ username: users.username })
    .from(users)
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .limit(1)
  if (existing.length === 0)
    return { ok: false, error: "المستخدم غير موجود" } as const
  const hash = await bcrypt.hash(existing[0].username, 12)
  const row = await db
    .update(users)
    .set({
      password: hash,
      mustResetPassword: true,
      updatedBy: user.id,
      updatedAt: now,
    })
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .returning({ id: users.id })
  if (row.length === 0)
    return { ok: false, error: "المستخدم غير موجود" } as const
  return { ok: true, data: row[0] } as const
}

export async function softDeleteUser(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  if (input.id === user.id) {
    return { ok: false, error: "لا يمكن حذف حسابك الحالي" } as const
  }
  const target = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .limit(1)
  if (target.length > 0 && target[0].isAdmin) {
    const adminCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNull(users.deletedAt)))
    if ((adminCount[0]?.count ?? 0) <= 1) {
      return { ok: false, error: "لا يمكن حذف آخر مسؤول" } as const
    }
  }
  const result = await db
    .update(users)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .returning({ id: users.id })
  if (result.length === 0) {
    return { ok: false, error: "المستخدم غير موجود" } as const
  }
  return { ok: true, data: result[0] } as const
}
