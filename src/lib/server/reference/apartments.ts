"use server"
import { and, eq, isNull } from "drizzle-orm"
import { apartmentEditSchema, apartmentSchema } from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { apartmentContacts, apartments, towers } from "@/lib/server/schema"
import { actor, now, safeMutation, type MutationResult } from "./shared"

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
        unitNumber: parsed.data.unitNumber?.trim() || null,
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
  const parsed = apartmentEditSchema.safeParse({
    label: input.label,
    unitNumber: input.unitNumber,
  })
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(apartments)
      .set({
        label: parsed.data.label,
        unitNumber: parsed.data.unitNumber?.trim() || null,
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
