"use server"
import { and, eq, isNull } from "drizzle-orm"
import { phoneNumberSchema } from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { apartmentContacts, phoneNumbers } from "@/lib/server/schema"
import { actor, now, safeMutation, type MutationResult } from "./shared"

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
