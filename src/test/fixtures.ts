import { eq } from "drizzle-orm"
import type { DB } from "@/lib/server/db"
import {
  apartmentContacts,
  apartments,
  batchSessions,
  contacts,
  invoices,
  messages,
  phoneNumbers,
  projects,
  towers,
  users,
} from "@/lib/server/schema"

type Overrides<T extends { $inferInsert: unknown }> = Partial<T["$inferInsert"]>
type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"]

let sequence = 0
const next = (): number => ++sequence

async function creatorId(
  db: DB,
  createdBy: number | undefined
): Promise<number> {
  return createdBy ?? (await createUser(db)).id
}

export async function createUser(
  db: DB,
  overrides: Overrides<typeof users> = {}
): Promise<Row<typeof users>> {
  const n = next()
  const [row] = await db
    .insert(users)
    .values({
      fullname: `Test User ${n}`,
      username: `user${n}`,
      password: "hashed-password",
      ...overrides,
    })
    .returning()
  return row
}

export async function createProject(
  db: DB,
  overrides: Overrides<typeof projects> = {}
): Promise<Row<typeof projects>> {
  const [row] = await db
    .insert(projects)
    .values({
      title: `Project ${next()}`,
      ...overrides,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createTower(
  db: DB,
  overrides: Overrides<typeof towers> = {}
): Promise<Row<typeof towers>> {
  const [row] = await db
    .insert(towers)
    .values({
      label: `Tower ${next()}`,
      ...overrides,
      projectId: overrides.projectId ?? (await createProject(db)).id,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createApartment(
  db: DB,
  overrides: Overrides<typeof apartments> = {}
): Promise<Row<typeof apartments>> {
  const tower = overrides.towerId
    ? await db.query.towers.findFirst({
        where: eq(towers.id, overrides.towerId),
      })
    : await createTower(db, { projectId: overrides.projectId })
  if (!tower) throw new Error(`Tower ${overrides.towerId} not found`)
  const towerId = tower.id
  const projectId = overrides.projectId ?? tower.projectId
  const [row] = await db
    .insert(apartments)
    .values({
      label: `Apt ${next()}`,
      ...overrides,
      towerId,
      projectId,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createContact(
  db: DB,
  overrides: Overrides<typeof contacts> = {}
): Promise<Row<typeof contacts>> {
  const [row] = await db
    .insert(contacts)
    .values({
      fullname: `Contact ${next()}`,
      ...overrides,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createPhoneNumber(
  db: DB,
  overrides: Overrides<typeof phoneNumbers> = {}
): Promise<Row<typeof phoneNumbers>> {
  const [row] = await db
    .insert(phoneNumbers)
    .values({
      number: `9715${String(10000000 + next()).slice(-8)}`,
      ...overrides,
      contactId: overrides.contactId ?? (await createContact(db)).id,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createApartmentContact(
  db: DB,
  overrides: Overrides<typeof apartmentContacts> = {}
): Promise<Row<typeof apartmentContacts>> {
  const [row] = await db
    .insert(apartmentContacts)
    .values({
      role: "owner",
      ...overrides,
      apartmentId: overrides.apartmentId ?? (await createApartment(db)).id,
      contactId: overrides.contactId ?? (await createContact(db)).id,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createBatch(
  db: DB,
  overrides: Overrides<typeof batchSessions> = {}
): Promise<Row<typeof batchSessions>> {
  const [row] = await db
    .insert(batchSessions)
    .values({
      title: `Batch ${next()}`,
      ...overrides,
      projectId: overrides.projectId ?? (await createProject(db)).id,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createInvoice(
  db: DB,
  overrides: Overrides<typeof invoices> = {}
): Promise<Row<typeof invoices>> {
  const batch = overrides.batchId ? undefined : await createBatch(db)
  const batchId = overrides.batchId ?? batch?.id
  if (batchId === undefined) throw new Error("createInvoice needs a batch")
  const [row] = await db
    .insert(invoices)
    .values({
      clientName: `Client ${next()}`,
      total: 100,
      ...overrides,
      batchId,
      apartmentId:
        overrides.apartmentId ??
        (await createApartment(db, { projectId: batch?.projectId })).id,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}

export async function createMessage(
  db: DB,
  overrides: Overrides<typeof messages> = {}
): Promise<Row<typeof messages>> {
  const [row] = await db
    .insert(messages)
    .values({
      contents: "Test message",
      templateType: "notification",
      ...overrides,
      invoiceId: overrides.invoiceId ?? (await createInvoice(db)).id,
      phoneNumberId: overrides.phoneNumberId ?? (await createPhoneNumber(db)).id,
      createdBy: await creatorId(db, overrides.createdBy),
    })
    .returning()
  return row
}
