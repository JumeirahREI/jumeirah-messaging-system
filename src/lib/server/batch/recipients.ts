import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/server/db"
import { apartmentContacts, contacts, phoneNumbers } from "@/lib/server/schema"

export type RecipientPhone = { id: number; contactId: number; number: string }

export type ResolvedRecipients = {
  phonesByApartment: Map<number, RecipientPhone[]>
  apartmentsWithContacts: Set<number>
}

export async function resolveRecipients(
  apartmentIds: number[]
): Promise<ResolvedRecipients> {
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
  const apartmentsWithContacts = new Set<number>()
  for (const l of linkRows) {
    const phones = phonesByContact.get(l.contactId) ?? []
    const hasPhones = phones.length > 0
    const existing = phonesByApartment.get(l.apartmentId) ?? []
    for (const p of phones) {
      if (!existing.some((e) => e.id === p.id)) existing.push(p)
    }
    phonesByApartment.set(l.apartmentId, existing)
    if (hasPhones) apartmentsWithContacts.add(l.apartmentId)
  }

  return { phonesByApartment, apartmentsWithContacts }
}
