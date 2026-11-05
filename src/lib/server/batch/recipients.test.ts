import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apartmentContacts, contacts, phoneNumbers } from "@/lib/server/schema"
import { createTestDb, type TestDb } from "@/test/db"
import {
  createApartment,
  createApartmentContact,
  createContact,
  createPhoneNumber,
} from "@/test/fixtures"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/server/db", () => ({
  get db() {
    return holder.db
  },
}))

const { resolveRecipients } = await import("./recipients")

let testDb: TestDb

beforeEach(async () => {
  testDb = await createTestDb()
  holder.db = testDb.db
})

afterEach(async () => {
  await testDb.cleanup()
})

describe("resolveRecipients", () => {
  it("returns the phones of notification-recipient contacts per apartment", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const contact = await createContact(db)
    const phone = await createPhoneNumber(db, { contactId: contact.id })
    await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: contact.id,
    })

    const result = await resolveRecipients([apt.id])

    expect(result.phonesByApartment.get(apt.id)?.map((p) => p.id)).toEqual([
      phone.id,
    ])
    expect(result.apartmentsWithContacts.has(apt.id)).toBe(true)
  })

  it("ignores contacts that are not notification recipients", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const contact = await createContact(db)
    await createPhoneNumber(db, { contactId: contact.id })
    await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: contact.id,
      isNotificationRecipient: false,
    })

    const result = await resolveRecipients([apt.id])

    expect(result.phonesByApartment.get(apt.id)).toBeUndefined()
    expect(result.apartmentsWithContacts.has(apt.id)).toBe(false)
  })

  it("excludes soft-deleted links, contacts and phones", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const deletedAt = "2026-01-01 00:00:00"

    const linkDeleted = await createContact(db)
    await createPhoneNumber(db, { contactId: linkDeleted.id })
    const link = await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: linkDeleted.id,
    })
    await db
      .update(apartmentContacts)
      .set({ deletedAt })
      .where(eq(apartmentContacts.id, link.id))

    const contactDeleted = await createContact(db)
    await createPhoneNumber(db, { contactId: contactDeleted.id })
    await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: contactDeleted.id,
    })
    await db
      .update(contacts)
      .set({ deletedAt })
      .where(eq(contacts.id, contactDeleted.id))

    const phoneDeleted = await createContact(db)
    const deadPhone = await createPhoneNumber(db, {
      contactId: phoneDeleted.id,
    })
    await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: phoneDeleted.id,
    })
    await db
      .update(phoneNumbers)
      .set({ deletedAt })
      .where(eq(phoneNumbers.id, deadPhone.id))

    const result = await resolveRecipients([apt.id])

    expect(result.phonesByApartment.get(apt.id)).toEqual([])
    expect(result.apartmentsWithContacts.has(apt.id)).toBe(false)
  })

  it("returns the same phone row once per apartment it is linked to", async () => {
    const { db } = testDb
    const one = await createApartment(db)
    const two = await createApartment(db)
    const contact = await createContact(db)
    const phone = await createPhoneNumber(db, { contactId: contact.id })
    await createApartmentContact(db, {
      apartmentId: one.id,
      contactId: contact.id,
    })
    await createApartmentContact(db, {
      apartmentId: two.id,
      contactId: contact.id,
    })

    const result = await resolveRecipients([one.id, two.id])

    expect(result.phonesByApartment.get(one.id)?.map((p) => p.id)).toEqual([
      phone.id,
    ])
    expect(result.phonesByApartment.get(two.id)?.map((p) => p.id)).toEqual([
      phone.id,
    ])
  })

  it("keeps distinct phone rows that share a number (dedupe is by phone id)", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const a = await createContact(db)
    const b = await createContact(db)
    const phoneA = await createPhoneNumber(db, {
      contactId: a.id,
      number: "971500000001",
    })
    const phoneB = await createPhoneNumber(db, {
      contactId: b.id,
      number: "971500000001",
    })
    await createApartmentContact(db, { apartmentId: apt.id, contactId: a.id })
    await createApartmentContact(db, { apartmentId: apt.id, contactId: b.id })

    const result = await resolveRecipients([apt.id])

    expect(
      (result.phonesByApartment.get(apt.id) ?? []).map((p) => p.id).sort()
    ).toEqual([phoneA.id, phoneB.id].sort())
  })

  it("treats a contact without phones as having no recipients", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const contact = await createContact(db)
    await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: contact.id,
    })

    const result = await resolveRecipients([apt.id])

    expect(result.phonesByApartment.get(apt.id)).toEqual([])
    expect(result.apartmentsWithContacts.has(apt.id)).toBe(false)
  })

  it("resolves several apartments independently", async () => {
    const { db } = testDb
    const one = await createApartment(db)
    const two = await createApartment(db)
    const contact = await createContact(db)
    const phone = await createPhoneNumber(db, { contactId: contact.id })
    await createApartmentContact(db, {
      apartmentId: two.id,
      contactId: contact.id,
    })

    const result = await resolveRecipients([one.id, two.id])

    expect(result.phonesByApartment.get(one.id)).toBeUndefined()
    expect(result.phonesByApartment.get(two.id)?.map((p) => p.id)).toEqual([
      phone.id,
    ])
  })
})
