import { and, eq, inArray, isNull } from "drizzle-orm"
import { mapChunks } from "@/lib/chunk"
import { extractLocalNumber } from "@/lib/phone"
import { db } from "@/lib/server/db"
import { apartmentContacts, contacts, phoneNumbers } from "@/lib/server/schema"

const IN_LIST_CHUNK = 500

export type RecipientPhone = { id: number; contactId: number; number: string }

export type ResolvedRecipients = {
  phonesByApartment: Map<number, RecipientPhone[]>
  apartmentsWithContacts: Set<number>
}

export async function resolveRecipients(
  apartmentIds: number[]
): Promise<ResolvedRecipients> {
  const linkRows = await mapChunks(apartmentIds, IN_LIST_CHUNK, (part) =>
    db
      .select({
        apartmentId: apartmentContacts.apartmentId,
        contactId: apartmentContacts.contactId,
      })
      .from(apartmentContacts)
      .innerJoin(contacts, eq(apartmentContacts.contactId, contacts.id))
      .where(
        and(
          inArray(apartmentContacts.apartmentId, part),
          isNull(apartmentContacts.deletedAt),
          isNull(contacts.deletedAt),
          eq(apartmentContacts.isNotificationRecipient, true)
        )
      )
  )

  const contactIds = [...new Set(linkRows.map((l) => l.contactId))]
  const phoneRows = await mapChunks(contactIds, IN_LIST_CHUNK, (part) =>
    db
      .select({
        id: phoneNumbers.id,
        contactId: phoneNumbers.contactId,
        number: phoneNumbers.number,
      })
      .from(phoneNumbers)
      .where(
        and(
          inArray(phoneNumbers.contactId, part),
          isNull(phoneNumbers.deletedAt)
        )
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
    const existing = phonesByApartment.get(l.apartmentId) ?? []
    existing.push(...phones)
    phonesByApartment.set(l.apartmentId, existing)
    if (phones.length > 0) apartmentsWithContacts.add(l.apartmentId)
  }

  for (const [apartmentId, phones] of phonesByApartment) {
    const byNumber = new Map<string, (typeof phones)[number]>()
    for (const p of phones) {
      const key = extractLocalNumber(p.number)
      const kept = byNumber.get(key)
      if (!kept || p.id < kept.id) byNumber.set(key, p)
    }
    phonesByApartment.set(
      apartmentId,
      [...byNumber.values()].sort((a, b) => a.id - b.id)
    )
  }

  return { phonesByApartment, apartmentsWithContacts }
}
