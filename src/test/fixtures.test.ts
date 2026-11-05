import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "@/test/db"
import {
  createApartment,
  createApartmentContact,
  createBatch,
  createContact,
  createInvoice,
  createMessage,
  createPhoneNumber,
  createProject,
  createTower,
  createUser,
} from "@/test/fixtures"

let testDb: TestDb

beforeEach(async () => {
  testDb = await createTestDb()
})

afterEach(async () => {
  await testDb.cleanup()
})

describe("fixtures", () => {
  it("creates users with unique usernames and overrides", async () => {
    const a = await createUser(testDb.db)
    const b = await createUser(testDb.db, { isAdmin: true, fullname: "Boss" })
    expect(a.username).not.toBe(b.username)
    expect(b.isAdmin).toBe(true)
    expect(b.fullname).toBe("Boss")
  })

  it("builds a full message chain with defaults", async () => {
    const message = await createMessage(testDb.db)
    expect(message.status).toBe("pending")
    expect(message.templateType).toBe("notification")
    const invoice = await createInvoice(testDb.db, { total: 123.5 })
    expect(invoice.total).toBe(123.5)
  })

  it("honours explicit parent ids", async () => {
    const user = await createUser(testDb.db)
    const project = await createProject(testDb.db, { createdBy: user.id })
    const tower = await createTower(testDb.db, { projectId: project.id })
    const apartment = await createApartment(testDb.db, { towerId: tower.id })
    expect(apartment.projectId).toBe(project.id)
    const batch = await createBatch(testDb.db, { projectId: project.id })
    expect(batch.projectId).toBe(project.id)
    expect(batch.status).toBe("draft")
    const invoice = await createInvoice(testDb.db, {
      batchId: batch.id,
      apartmentId: apartment.id,
    })
    expect(invoice.batchId).toBe(batch.id)
  })

  it("links contacts, phones and apartments", async () => {
    const apartment = await createApartment(testDb.db)
    const contact = await createContact(testDb.db)
    const phone = await createPhoneNumber(testDb.db, { contactId: contact.id })
    const link = await createApartmentContact(testDb.db, {
      apartmentId: apartment.id,
      contactId: contact.id,
    })
    expect(phone.contactId).toBe(contact.id)
    expect(link.isNotificationRecipient).toBe(true)
    expect(link.role).toBe("owner")
  })
})
