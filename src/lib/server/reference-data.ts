import { createServerFn } from "@tanstack/react-start"
import bcrypt from "bcryptjs"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import type { SessionUser } from "./auth.server"
import { requireRole } from "./auth.server"
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

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectRow = {
  id: number
  title: string
  createdAt: string | null
}

export const listProjects = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireRole("admin")
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
)

export const getProject = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
    const rows = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)))
      .limit(1)
    return rows.length > 0 ? rows[0] : null
  })

export const createProject = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const title = (input as { title?: unknown }).title
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new Error("العنوان مطلوب")
    }
    return { title: title.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const [row] = await db
        .insert(projects)
        .values({ title: data.title, ...actor(user) })
        .returning({ id: projects.id, title: projects.title })
      return { ok: true, data: row } as const
    })
  })

export const updateProject = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const title = (input as { title?: unknown }).title
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new Error("العنوان مطلوب")
    }
    return { id, title: title.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const row = await db
        .update(projects)
        .set({ title: data.title, updatedBy: user.id, updatedAt: now })
        .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)))
        .returning({ id: projects.id, title: projects.title })
      if (row.length === 0)
        return { ok: false, error: "المشروع غير موجود" } as const
      return { ok: true, data: row[0] } as const
    })
  })

export const softDeleteProject = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    const result = await db
      .update(projects)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)))
      .returning({ id: projects.id })
    if (result.length === 0) {
      return { ok: false, error: "المشروع غير موجود" } as const
    }

    const towerRows = await db
      .select({ id: towers.id })
      .from(towers)
      .where(and(eq(towers.projectId, data.id), isNull(towers.deletedAt)))
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
          and(
            inArray(apartments.towerId, towerIds),
            isNull(apartments.deletedAt)
          )
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
  })

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------

export type TowerRow = {
  id: number
  projectId: number
  label: string
  createdAt: string | null
}

export const listTowers = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const projectId = (input as { projectId?: unknown }).projectId
    if (typeof projectId !== "number") throw new Error("معرّف المشروع مطلوب")
    return { projectId }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
    const rows = await db
      .select({
        id: towers.id,
        projectId: towers.projectId,
        label: towers.label,
        createdAt: towers.createdAt,
      })
      .from(towers)
      .where(
        and(eq(towers.projectId, data.projectId), isNull(towers.deletedAt))
      )
      .orderBy(desc(towers.createdAt))
    return rows satisfies TowerRow[]
  })

export const getTower = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
    const rows = await db
      .select({
        id: towers.id,
        projectId: towers.projectId,
        label: towers.label,
      })
      .from(towers)
      .where(and(eq(towers.id, data.id), isNull(towers.deletedAt)))
      .limit(1)
    return rows.length > 0 ? rows[0] : null
  })

export const createTower = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const projectId = (input as { projectId?: unknown }).projectId
    const label = (input as { label?: unknown }).label
    if (typeof projectId !== "number") throw new Error("معرّف المشروع مطلوب")
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error("الاسم مطلوب")
    }
    return { projectId, label: label.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const [row] = await db
        .insert(towers)
        .values({
          projectId: data.projectId,
          label: data.label,
          ...actor(user),
        })
        .returning({
          id: towers.id,
          projectId: towers.projectId,
          label: towers.label,
        })
      return { ok: true, data: row } as const
    })
  })

export const updateTower = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const label = (input as { label?: unknown }).label
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error("الاسم مطلوب")
    }
    return { id, label: label.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const row = await db
        .update(towers)
        .set({ label: data.label, updatedBy: user.id, updatedAt: now })
        .where(and(eq(towers.id, data.id), isNull(towers.deletedAt)))
        .returning({ id: towers.id, label: towers.label })
      if (row.length === 0)
        return { ok: false, error: "البرج غير موجود" } as const
      return { ok: true, data: row[0] } as const
    })
  })

export const softDeleteTower = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    const result = await db
      .update(towers)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(eq(towers.id, data.id), isNull(towers.deletedAt)))
      .returning({ id: towers.id })
    if (result.length === 0) {
      return { ok: false, error: "البرج غير موجود" } as const
    }

    const aptRows = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(and(eq(apartments.towerId, data.id), isNull(apartments.deletedAt)))
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
  })

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

export const listApartments = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const towerId = (input as { towerId?: unknown }).towerId
    if (typeof towerId !== "number") throw new Error("معرّف البرج مطلوب")
    return { towerId }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
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
        and(eq(apartments.towerId, data.towerId), isNull(apartments.deletedAt))
      )
      .orderBy(apartments.label)
    return rows satisfies ApartmentRow[]
  })

export const getApartment = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
    const rows = await db
      .select({
        id: apartments.id,
        towerId: apartments.towerId,
        projectId: apartments.projectId,
        label: apartments.label,
        unitNumber: apartments.unitNumber,
      })
      .from(apartments)
      .where(and(eq(apartments.id, data.id), isNull(apartments.deletedAt)))
      .limit(1)
    return rows.length > 0 ? rows[0] : null
  })

export const createApartment = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const towerId = (input as { towerId?: unknown }).towerId
    const projectId = (input as { projectId?: unknown }).projectId
    const label = (input as { label?: unknown }).label
    const unitNumber = (input as { unitNumber?: unknown }).unitNumber
    if (typeof towerId !== "number") throw new Error("معرّف البرج مطلوب")
    if (typeof projectId !== "number") throw new Error("معرّف المشروع مطلوب")
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error("الاسم مطلوب")
    }
    return {
      towerId,
      projectId,
      label: label.trim(),
      unitNumber:
        typeof unitNumber === "string" && unitNumber.trim().length > 0
          ? unitNumber.trim()
          : null,
    }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const [row] = await db
        .insert(apartments)
        .values({
          towerId: data.towerId,
          projectId: data.projectId,
          label: data.label,
          unitNumber: data.unitNumber,
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
  })

export const updateApartment = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const label = (input as { label?: unknown }).label
    const unitNumber = (input as { unitNumber?: unknown }).unitNumber
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error("الاسم مطلوب")
    }
    return {
      id,
      label: label.trim(),
      unitNumber:
        typeof unitNumber === "string" && unitNumber.trim().length > 0
          ? unitNumber.trim()
          : null,
    }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const row = await db
        .update(apartments)
        .set({
          label: data.label,
          unitNumber: data.unitNumber,
          updatedBy: user.id,
          updatedAt: now,
        })
        .where(and(eq(apartments.id, data.id), isNull(apartments.deletedAt)))
        .returning({
          id: apartments.id,
          label: apartments.label,
          unitNumber: apartments.unitNumber,
        })
      if (row.length === 0)
        return { ok: false, error: "الشقة غير موجودة" } as const
      return { ok: true, data: row[0] } as const
    })
  })

export const softDeleteApartment = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    const result = await db
      .update(apartments)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(eq(apartments.id, data.id), isNull(apartments.deletedAt)))
      .returning({ id: apartments.id })
    if (result.length === 0) {
      return { ok: false, error: "الشقة غير موجودة" } as const
    }

    await db
      .update(apartmentContacts)
      .set({ deletedAt: now })
      .where(
        and(
          eq(apartmentContacts.apartmentId, data.id),
          isNull(apartmentContacts.deletedAt)
        )
      )

    return { ok: true, data: result[0] } as const
  })

// ---------------------------------------------------------------------------
// Contacts + apartment-contact links + phone numbers
// ---------------------------------------------------------------------------

export type ContactRow = { id: number; fullname: string }

export const listContacts = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireRole("admin")
    const rows = await db
      .select({ id: contacts.id, fullname: contacts.fullname })
      .from(contacts)
      .where(isNull(contacts.deletedAt))
      .orderBy(contacts.fullname)
    return rows satisfies ContactRow[]
  }
)

export const createContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const fullname = (input as { fullname?: unknown }).fullname
    if (typeof fullname !== "string" || fullname.trim().length === 0) {
      throw new Error("الاسم مطلوب")
    }
    return { fullname: fullname.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const [row] = await db
        .insert(contacts)
        .values({ fullname: data.fullname, ...actor(user) })
        .returning({ id: contacts.id, fullname: contacts.fullname })
      return { ok: true, data: row } as const
    })
  })

export type ApartmentContactRow = {
  id: number
  contactId: number
  contactName: string
  role: ContactRole
  isNotificationRecipient: boolean
}

export const listApartmentContacts = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const apartmentId = (input as { apartmentId?: unknown }).apartmentId
    if (typeof apartmentId !== "number") throw new Error("معرّف الشقة مطلوب")
    return { apartmentId }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
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
          eq(apartmentContacts.apartmentId, data.apartmentId),
          isNull(apartmentContacts.deletedAt),
          isNull(contacts.deletedAt)
        )
      )
      .orderBy(contacts.fullname)
    return rows satisfies ApartmentContactRow[]
  })

export const linkContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const apartmentId = (input as { apartmentId?: unknown }).apartmentId
    const contactId = (input as { contactId?: unknown }).contactId
    const role = (input as { role?: unknown }).role
    const isNotificationRecipient = (
      input as { isNotificationRecipient?: unknown }
    ).isNotificationRecipient
    if (typeof apartmentId !== "number") throw new Error("معرّف الشقة مطلوب")
    if (typeof contactId !== "number")
      throw new Error("معرّف جهة الاتصال مطلوب")
    if (
      typeof role !== "string" ||
      (role !== "owner" && role !== "tenant" && role !== "manager")
    ) {
      throw new Error("الدور غير صالح")
    }
    const narrowedRole: ContactRole = role
    return {
      apartmentId,
      contactId,
      role: narrowedRole,
      isNotificationRecipient:
        typeof isNotificationRecipient === "boolean"
          ? isNotificationRecipient
          : true,
    }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const [row] = await db
        .insert(apartmentContacts)
        .values({
          apartmentId: data.apartmentId,
          contactId: data.contactId,
          role: data.role,
          isNotificationRecipient: data.isNotificationRecipient,
          ...actor(user),
        })
        .returning({ id: apartmentContacts.id })
      return { ok: true, data: row } as const
    })
  })

export const updateContactLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const role = (input as { role?: unknown }).role
    const isNotificationRecipient = (
      input as { isNotificationRecipient?: unknown }
    ).isNotificationRecipient
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (
      typeof role !== "string" ||
      (role !== "owner" && role !== "tenant" && role !== "manager")
    ) {
      throw new Error("الدور غير صالح")
    }
    const narrowedRole: ContactRole = role
    return {
      id,
      role: narrowedRole,
      isNotificationRecipient:
        typeof isNotificationRecipient === "boolean"
          ? isNotificationRecipient
          : true,
    }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const row = await db
        .update(apartmentContacts)
        .set({
          role: data.role,
          isNotificationRecipient: data.isNotificationRecipient,
          updatedBy: user.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(apartmentContacts.id, data.id),
            isNull(apartmentContacts.deletedAt)
          )
        )
        .returning({ id: apartmentContacts.id })
      if (row.length === 0)
        return { ok: false, error: "الربط غير موجود" } as const
      return { ok: true, data: row[0] } as const
    })
  })

export const unlinkContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    const result = await db
      .update(apartmentContacts)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(
        and(
          eq(apartmentContacts.id, data.id),
          isNull(apartmentContacts.deletedAt)
        )
      )
      .returning({ id: apartmentContacts.id })
    if (result.length === 0) {
      return { ok: false, error: "الربط غير موجود" } as const
    }
    return { ok: true, data: result[0] } as const
  })

export type PhoneNumberRow = {
  id: number
  contactId: number
  number: string
}

export const listPhoneNumbers = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const contactId = (input as { contactId?: unknown }).contactId
    if (typeof contactId !== "number")
      throw new Error("معرّف جهة الاتصال مطلوب")
    return { contactId }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
    const rows = await db
      .select({
        id: phoneNumbers.id,
        contactId: phoneNumbers.contactId,
        number: phoneNumbers.number,
      })
      .from(phoneNumbers)
      .where(
        and(
          eq(phoneNumbers.contactId, data.contactId),
          isNull(phoneNumbers.deletedAt)
        )
      )
      .orderBy(phoneNumbers.number)
    return rows satisfies PhoneNumberRow[]
  })

export type ApartmentPhoneNumberRow = {
  id: number
  contactId: number
  number: string
}

export const listPhoneNumbersForApartment = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const apartmentId = (input as { apartmentId?: unknown }).apartmentId
    if (typeof apartmentId !== "number") throw new Error("معرّف الشقة مطلوب")
    return { apartmentId }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
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
          eq(apartmentContacts.apartmentId, data.apartmentId),
          isNull(apartmentContacts.deletedAt),
          isNull(phoneNumbers.deletedAt)
        )
      )
      .orderBy(phoneNumbers.number)
    return rows satisfies ApartmentPhoneNumberRow[]
  })

export const addPhoneNumber = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const contactId = (input as { contactId?: unknown }).contactId
    const number = (input as { number?: unknown }).number
    if (typeof contactId !== "number")
      throw new Error("معرّف جهة الاتصال مطلوب")
    if (typeof number !== "string" || number.trim().length === 0) {
      throw new Error("الرقم مطلوب")
    }
    return { contactId, number: number.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const [row] = await db
        .insert(phoneNumbers)
        .values({
          contactId: data.contactId,
          number: data.number,
          ...actor(user),
        })
        .returning({
          id: phoneNumbers.id,
          contactId: phoneNumbers.contactId,
          number: phoneNumbers.number,
        })
      return { ok: true, data: row } as const
    })
  })

export const updatePhoneNumber = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const number = (input as { number?: unknown }).number
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (typeof number !== "string" || number.trim().length === 0) {
      throw new Error("الرقم مطلوب")
    }
    return { id, number: number.trim() }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const row = await db
        .update(phoneNumbers)
        .set({ number: data.number, updatedBy: user.id, updatedAt: now })
        .where(
          and(eq(phoneNumbers.id, data.id), isNull(phoneNumbers.deletedAt))
        )
        .returning({ id: phoneNumbers.id, number: phoneNumbers.number })
      if (row.length === 0)
        return { ok: false, error: "الرقم غير موجود" } as const
      return { ok: true, data: row[0] } as const
    })
  })

export const deletePhoneNumber = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    const result = await db
      .update(phoneNumbers)
      .set({ deletedBy: user.id, deletedAt: now })
      .where(and(eq(phoneNumbers.id, data.id), isNull(phoneNumbers.deletedAt)))
      .returning({ id: phoneNumbers.id })
    if (result.length === 0) {
      return { ok: false, error: "الرقم غير موجود" } as const
    }
    return { ok: true, data: result[0] } as const
  })

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type UserRow = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
  createdAt: string | null
}

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireRole("admin")
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
  return rows satisfies UserRow[]
})

export const getUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    await requireRole("admin")
    const rows = await db
      .select({
        id: users.id,
        fullname: users.fullname,
        username: users.username,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(and(eq(users.id, data.id), isNull(users.deletedAt)))
      .limit(1)
    return rows.length > 0 ? rows[0] : null
  })

export const createUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const fullname = (input as { fullname?: unknown }).fullname
    const username = (input as { username?: unknown }).username
    const password = (input as { password?: unknown }).password
    const isAdmin = (input as { isAdmin?: unknown }).isAdmin
    if (typeof fullname !== "string" || fullname.trim().length === 0) {
      throw new Error("الاسم الكامل مطلوب")
    }
    if (typeof username !== "string" || username.trim().length === 0) {
      throw new Error("اسم المستخدم مطلوب")
    }
    if (typeof password !== "string" || password.length < 6) {
      throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    }
    return {
      fullname: fullname.trim(),
      username: username.trim(),
      password,
      isAdmin: typeof isAdmin === "boolean" ? isAdmin : false,
    }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      const hash = await bcrypt.hash(data.password, 12)
      const [row] = await db
        .insert(users)
        .values({
          fullname: data.fullname,
          username: data.username,
          password: hash,
          isAdmin: data.isAdmin,
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
  })

export const updateUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const fullname = (input as { fullname?: unknown }).fullname
    const username = (input as { username?: unknown }).username
    const isAdmin = (input as { isAdmin?: unknown }).isAdmin
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (typeof fullname !== "string" || fullname.trim().length === 0) {
      throw new Error("الاسم الكامل مطلوب")
    }
    if (typeof username !== "string" || username.trim().length === 0) {
      throw new Error("اسم المستخدم مطلوب")
    }
    return {
      id,
      fullname: fullname.trim(),
      username: username.trim(),
      isAdmin: typeof isAdmin === "boolean" ? isAdmin : false,
    }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    return safeMutation(async () => {
      if (data.isAdmin === false) {
        const target = await db
          .select({ isAdmin: users.isAdmin })
          .from(users)
          .where(and(eq(users.id, data.id), isNull(users.deletedAt)))
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
          fullname: data.fullname,
          username: data.username,
          isAdmin: data.isAdmin,
          updatedBy: user.id,
          updatedAt: now,
        })
        .where(and(eq(users.id, data.id), isNull(users.deletedAt)))
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
  })

export const resetUserPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    const password = (input as { password?: unknown }).password
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    if (typeof password !== "string" || password.length < 6) {
      throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    }
    return { id, password }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    const hash = await bcrypt.hash(data.password, 12)
    const row = await db
      .update(users)
      .set({ password: hash, updatedBy: user.id, updatedAt: now })
      .where(and(eq(users.id, data.id), isNull(users.deletedAt)))
      .returning({ id: users.id })
    if (row.length === 0)
      return { ok: false, error: "المستخدم غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })

export const softDeleteUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null)
      throw new Error("إدخال غير صالح")
    const id = (input as { id?: unknown }).id
    if (typeof id !== "number") throw new Error("المعرّف مطلوب")
    return { id }
  })
  .handler(async ({ data }) => {
    const user = await requireRole("admin")
    if (data.id === user.id) {
      return { ok: false, error: "لا يمكن حذف حسابك الحالي" } as const
    }
    const target = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(and(eq(users.id, data.id), isNull(users.deletedAt)))
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
      .where(and(eq(users.id, data.id), isNull(users.deletedAt)))
      .returning({ id: users.id })
    if (result.length === 0) {
      return { ok: false, error: "المستخدم غير موجود" } as const
    }
    return { ok: true, data: result[0] } as const
  })
