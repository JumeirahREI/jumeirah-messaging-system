import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  apartmentContacts,
  apartments,
  contacts,
  phoneNumbers,
  projects,
  towers,
} from "@/lib/server/schema"
import {
  adminUser,
  authHelpersModule,
  resetAuth,
  setTestUser,
} from "@/test/auth"
import { createTestDb, type TestDb } from "@/test/db"
import {
  createApartment,
  createApartmentContact,
  createBatch,
  createContact,
  createPhoneNumber,
  createProject,
  createTower,
  createUser,
} from "@/test/fixtures"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/server/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("@/lib/server/auth-helpers", () => authHelpersModule())
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  mutationLimiter: null,
}))

const { softDeleteProject } = await import("./projects")
const { softDeleteTower } = await import("./towers")
const { softDeleteApartment } = await import("./apartments")
const { softDeleteContact } = await import("./contacts")
const { deletePhoneNumber } = await import("./phones")

let testDb: TestDb
let actorId: number

beforeEach(async () => {
  testDb = await createTestDb()
  holder.db = testDb.db
  const actor = await createUser(testDb.db)
  actorId = actor.id
  setTestUser(adminUser({ id: actorId }))
})

afterEach(async () => {
  resetAuth()
  await testDb.cleanup()
})

async function seedTree() {
  const { db } = testDb
  const project = await createProject(db)
  const tower = await createTower(db, { projectId: project.id })
  const apartment = await createApartment(db, { towerId: tower.id })
  const contact = await createContact(db)
  const phone = await createPhoneNumber(db, { contactId: contact.id })
  const link = await createApartmentContact(db, {
    apartmentId: apartment.id,
    contactId: contact.id,
  })
  return { project, tower, apartment, contact, phone, link }
}

async function failOnUpdate(table: string) {
  await testDb.client.execute(
    `CREATE TRIGGER fail_${table} BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'injected failure'); END`
  )
}

async function row<
  T extends { deletedAt: string | null; deletedBy: number | null },
>(rows: Promise<T[]>): Promise<T> {
  const [first] = await rows
  return first
}

const projectRow = (id: number) =>
  row(testDb.db.select().from(projects).where(eq(projects.id, id)))
const towerRow = (id: number) =>
  row(testDb.db.select().from(towers).where(eq(towers.id, id)))
const apartmentRow = (id: number) =>
  row(testDb.db.select().from(apartments).where(eq(apartments.id, id)))
const linkRow = (id: number) =>
  row(
    testDb.db
      .select()
      .from(apartmentContacts)
      .where(eq(apartmentContacts.id, id))
  )
const contactRow = (id: number) =>
  row(testDb.db.select().from(contacts).where(eq(contacts.id, id)))
const phoneRow = (id: number) =>
  row(testDb.db.select().from(phoneNumbers).where(eq(phoneNumbers.id, id)))

describe("softDeleteProject", () => {
  it("cascades to towers, apartments and links and records deleted_by on each", async () => {
    const t = await seedTree()

    const result = await softDeleteProject({ id: t.project.id })

    expect(result.ok).toBe(true)
    for (const r of [
      await projectRow(t.project.id),
      await towerRow(t.tower.id),
      await apartmentRow(t.apartment.id),
      await linkRow(t.link.id),
    ]) {
      expect(r.deletedAt).not.toBeNull()
      expect(r.deletedBy).toBe(actorId)
    }
  })

  it("leaves nothing deleted when a cascaded statement fails midway", async () => {
    const t = await seedTree()
    await failOnUpdate("apartments")

    await expect(softDeleteProject({ id: t.project.id })).rejects.toThrow()

    expect((await projectRow(t.project.id)).deletedAt).toBeNull()
    expect((await towerRow(t.tower.id)).deletedAt).toBeNull()
    expect((await apartmentRow(t.apartment.id)).deletedAt).toBeNull()
  })

  it("is rejected and deletes nothing while a batch of the project is sending", async () => {
    const t = await seedTree()
    await createBatch(testDb.db, { projectId: t.project.id, status: "sending" })

    const result = await softDeleteProject({ id: t.project.id })

    expect(result.ok).toBe(false)
    expect((await projectRow(t.project.id)).deletedAt).toBeNull()
    expect((await towerRow(t.tower.id)).deletedAt).toBeNull()
    expect((await apartmentRow(t.apartment.id)).deletedAt).toBeNull()
  })

  it("succeeds when the project only has draft and completed batches", async () => {
    const t = await seedTree()
    await createBatch(testDb.db, { projectId: t.project.id, status: "draft" })
    await createBatch(testDb.db, {
      projectId: t.project.id,
      status: "completed",
    })

    const result = await softDeleteProject({ id: t.project.id })

    expect(result.ok).toBe(true)
  })
})

describe("softDeleteTower", () => {
  it("records deleted_by on cascaded apartments and links", async () => {
    const t = await seedTree()

    const result = await softDeleteTower({ id: t.tower.id })

    expect(result.ok).toBe(true)
    for (const r of [
      await towerRow(t.tower.id),
      await apartmentRow(t.apartment.id),
      await linkRow(t.link.id),
    ]) {
      expect(r.deletedAt).not.toBeNull()
      expect(r.deletedBy).toBe(actorId)
    }
  })

  it("leaves nothing deleted when a cascaded statement fails midway", async () => {
    const t = await seedTree()
    await failOnUpdate("apartments")

    await expect(softDeleteTower({ id: t.tower.id })).rejects.toThrow()

    expect((await towerRow(t.tower.id)).deletedAt).toBeNull()
    expect((await apartmentRow(t.apartment.id)).deletedAt).toBeNull()
  })
})

describe("softDeleteApartment", () => {
  it("records deleted_by on cascaded links", async () => {
    const t = await seedTree()

    const result = await softDeleteApartment({ id: t.apartment.id })

    expect(result.ok).toBe(true)
    const link = await linkRow(t.link.id)
    expect(link.deletedAt).not.toBeNull()
    expect(link.deletedBy).toBe(actorId)
  })

  it("leaves nothing deleted when the link update fails", async () => {
    const t = await seedTree()
    await failOnUpdate("apartment_contacts")

    await expect(softDeleteApartment({ id: t.apartment.id })).rejects.toThrow()

    expect((await apartmentRow(t.apartment.id)).deletedAt).toBeNull()
  })
})

describe("softDeleteContact", () => {
  it("records deleted_by on cascaded phones and links", async () => {
    const t = await seedTree()

    const result = await softDeleteContact({ id: t.contact.id })

    expect(result.ok).toBe(true)
    for (const r of [
      await contactRow(t.contact.id),
      await phoneRow(t.phone.id),
      await linkRow(t.link.id),
    ]) {
      expect(r.deletedAt).not.toBeNull()
      expect(r.deletedBy).toBe(actorId)
    }
  })

  it("leaves nothing deleted when the link update fails", async () => {
    const t = await seedTree()
    await failOnUpdate("apartment_contacts")

    await expect(softDeleteContact({ id: t.contact.id })).rejects.toThrow()

    expect((await contactRow(t.contact.id)).deletedAt).toBeNull()
    expect((await phoneRow(t.phone.id)).deletedAt).toBeNull()
  })
})

describe("deletePhoneNumber", () => {
  it("soft-deletes the phone and records deleted_by", async () => {
    const t = await seedTree()

    const result = await deletePhoneNumber({ id: t.phone.id })

    expect(result.ok).toBe(true)
    expect((await phoneRow(t.phone.id)).deletedBy).toBe(actorId)
  })
})
