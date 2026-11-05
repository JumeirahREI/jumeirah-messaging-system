import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apartmentContacts, contacts, phoneNumbers } from "@/lib/server/schema"
import { createTestDb, type TestDb } from "@/test/db"
import {
  createApartment,
  createApartmentContact,
  createContact,
  createPhoneNumber,
  createTower,
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

  it("keeps only the lowest phone id when two contacts share a number", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const a = await createContact(db)
    const b = await createContact(db)
    const phoneA = await createPhoneNumber(db, {
      contactId: a.id,
      number: "971500000001",
    })
    await createPhoneNumber(db, {
      contactId: b.id,
      number: "971500000001",
    })
    await createApartmentContact(db, { apartmentId: apt.id, contactId: b.id })
    await createApartmentContact(db, { apartmentId: apt.id, contactId: a.id })

    const result = await resolveRecipients([apt.id])

    expect(result.phonesByApartment.get(apt.id)?.map((p) => p.id)).toEqual([
      phoneA.id,
    ])
    expect(result.apartmentsWithContacts.has(apt.id)).toBe(true)
  })

  it("dedupes one contact's number stored twice, even in different formats", async () => {
    const { db } = testDb
    const apt = await createApartment(db)
    const contact = await createContact(db)
    const first = await createPhoneNumber(db, {
      contactId: contact.id,
      number: "967771234567",
    })
    await createPhoneNumber(db, { contactId: contact.id, number: "771234567" })
    await createApartmentContact(db, {
      apartmentId: apt.id,
      contactId: contact.id,
    })

    const result = await resolveRecipients([apt.id])

    expect(result.phonesByApartment.get(apt.id)?.map((p) => p.id)).toEqual([
      first.id,
    ])
  })

  it("keeps distinct numbers and the same number in different apartments", async () => {
    const { db } = testDb
    const one = await createApartment(db)
    const two = await createApartment(db)
    const contact = await createContact(db)
    const phoneA = await createPhoneNumber(db, {
      contactId: contact.id,
      number: "967771111111",
    })
    const phoneB = await createPhoneNumber(db, {
      contactId: contact.id,
      number: "967772222222",
    })
    await createApartmentContact(db, {
      apartmentId: one.id,
      contactId: contact.id,
    })
    await createApartmentContact(db, {
      apartmentId: two.id,
      contactId: contact.id,
    })

    const result = await resolveRecipients([one.id, two.id])

    for (const apt of [one, two]) {
      expect(
        (result.phonesByApartment.get(apt.id) ?? []).map((p) => p.id).sort()
      ).toEqual([phoneA.id, phoneB.id].sort())
    }
  })

  it("resolves more than 500 apartments without a variable-limit error", async () => {
    const { db } = testDb
    const contact = await createContact(db)
    await createPhoneNumber(db, { contactId: contact.id })
    const apts = []
    const tower = await createTower(db)
    for (let i = 0; i < 520; i++) {
      apts.push(
        await createApartment(db, {
          towerId: tower.id,
          projectId: tower.projectId,
          createdBy: tower.createdBy,
        })
      )
    }
    for (const apt of apts) {
      await createApartmentContact(db, {
        apartmentId: apt.id,
        contactId: contact.id,
      })
    }

    const result = await resolveRecipients(apts.map((a) => a.id))

    expect(result.apartmentsWithContacts.size).toBe(520)
  }, 60_000)

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
