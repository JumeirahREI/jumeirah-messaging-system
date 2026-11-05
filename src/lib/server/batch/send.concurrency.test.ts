import { eq, inArray } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { chunk } from "@/lib/chunk"
import {
  apartmentContacts,
  apartments,
  batchSessions,
  contacts,
  invoices,
  messages,
  phoneNumbers,
} from "@/lib/server/schema"
import { authHelpersModule, operatorUser, setTestUser } from "@/test/auth"
import { runConcurrently } from "@/test/concurrency"
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
vi.mock("./dispatch", () => ({ invokeBackgroundProcess: vi.fn() }))

const { sendBatch, sendWarning, retryFailed, resumeSending } =
  await import("./send")
const { invokeBackgroundProcess } = await import("./dispatch")

type ActionResult = { ok: true; batchId: number } | { ok: false; error: string }

let testDb: TestDb

function settled(results: PromiseSettledResult<ActionResult>[]) {
  expect(results.every((r) => r.status === "fulfilled")).toBe(true)
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
}

async function seedRecipient(apartmentId: number, number?: string) {
  const { db } = testDb
  const contact = await createContact(db)
  const phone = await createPhoneNumber(db, {
    contactId: contact.id,
    ...(number ? { number } : {}),
  })
  await createApartmentContact(db, { apartmentId, contactId: contact.id })
  return { contact, phone }
}

async function seedBatch(
  invoiceCount: number,
  status: "draft" | "sending" | "completed" = "draft"
) {
  const { db } = testDb
  const project = await createProject(db)
  const batch = await createBatch(db, { projectId: project.id, status })
  const rows = []
  for (let i = 0; i < invoiceCount; i++) {
    const apt = await createApartment(db, { projectId: project.id })
    const invoice = await createInvoice(db, {
      batchId: batch.id,
      apartmentId: apt.id,
      total: 100 + i,
    })
    const { phone } = await seedRecipient(apt.id)
    rows.push({ apt, invoice, phone })
  }
  return { batch, rows }
}

async function messagesOf(batchId: number) {
  const rows = await testDb.db
    .select({ message: messages })
    .from(messages)
    .innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(eq(invoices.batchId, batchId))
  return rows.map((r) => r.message)
}

async function batchStatus(batchId: number) {
  const [row] = await testDb.db
    .select({ status: batchSessions.status })
    .from(batchSessions)
    .where(eq(batchSessions.id, batchId))
  return row.status
}

beforeEach(async () => {
  testDb = await createTestDb()
  holder.db = testDb.db
  const user = await createUser(testDb.db)
  setTestUser(operatorUser({ id: user.id }))
  vi.mocked(invokeBackgroundProcess).mockClear()
})

afterEach(async () => {
  await testDb.cleanup()
})

describe("sendBatch atomicity", () => {
  it("lets exactly one of two concurrent sends win", async () => {
    const { batch, rows } = await seedBatch(3)

    const values = settled(
      await runConcurrently([
        () => sendBatch({ batchId: batch.id }),
        () => sendBatch({ batchId: batch.id }),
      ])
    )

    expect(values.filter((v) => v.ok)).toHaveLength(1)
    expect(await messagesOf(batch.id)).toHaveLength(rows.length)
    expect(await batchStatus(batch.id)).toBe("sending")
    expect(invokeBackgroundProcess).toHaveBeenCalledTimes(1)
  })

  it("returns the not-a-draft error for a second sequential send", async () => {
    const { batch } = await seedBatch(1)
    expect(await sendBatch({ batchId: batch.id })).toEqual({
      ok: true,
      batchId: batch.id,
    })

    expect(await sendBatch({ batchId: batch.id })).toEqual({
      ok: false,
      error: "الدفعة غير موجودة أو ليست مسودة",
    })
    expect(invokeBackgroundProcess).toHaveBeenCalledTimes(1)
  })

  it("rolls the batch back to draft when the message insert fails", async () => {
    const { batch, rows } = await seedBatch(2)
    const last = rows[rows.length - 1]
    await createMessage(testDb.db, {
      invoiceId: last.invoice.id,
      phoneNumberId: last.phone.id,
      templateType: "notification",
    })

    await expect(sendBatch({ batchId: batch.id })).rejects.toThrow()

    expect(await batchStatus(batch.id)).toBe("draft")
    expect(await messagesOf(batch.id)).toHaveLength(1)
    expect(invokeBackgroundProcess).not.toHaveBeenCalled()
  })

  it("sends 5,000 recipients without hitting the bound-variable limit", async () => {
    const { db } = testDb
    const project = await createProject(db)
    const batch = await createBatch(db, { projectId: project.id })
    const owner = await createUser(db)
    const tower = await createTower(db, { projectId: project.id })
    const count = 5000
    const seq = Array.from({ length: count }, (_, i) => i + 1)
    const bulk = async <T extends object>(
      insert: (part: T[]) => Promise<unknown>,
      items: T[]
    ) => {
      for (const part of chunk(items, 400)) await insert(part)
    }

    await bulk(
      (part) => db.insert(apartments).values(part),
      seq.map((i) => ({
        label: `Bulk ${i}`,
        towerId: tower.id,
        projectId: project.id,
        createdBy: owner.id,
      }))
    )
    await bulk(
      (part) => db.insert(contacts).values(part),
      seq.map((i) => ({ fullname: `Bulk ${i}`, createdBy: owner.id }))
    )
    const aptRows = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(eq(apartments.projectId, project.id))
    const contactRows = (
      await db.select({ id: contacts.id }).from(contacts)
    ).slice(-count)
    await bulk(
      (part) => db.insert(phoneNumbers).values(part),
      contactRows.map((c, i) => ({
        contactId: c.id,
        number: `9677${String(10000000 + i)}`,
        createdBy: owner.id,
      }))
    )
    await bulk(
      (part) => db.insert(apartmentContacts).values(part),
      aptRows.map((a, i) => ({
        apartmentId: a.id,
        contactId: contactRows[i].id,
        role: "owner" as const,
        createdBy: owner.id,
      }))
    )
    await bulk(
      (part) => db.insert(invoices).values(part),
      aptRows.map((a, i) => ({
        batchId: batch.id,
        apartmentId: a.id,
        clientName: `C${i}`,
        total: 50,
        createdBy: owner.id,
      }))
    )

    const result = await sendBatch({ batchId: batch.id })

    expect(result).toEqual({ ok: true, batchId: batch.id })
    expect(await messagesOf(batch.id)).toHaveLength(count)
    expect(await batchStatus(batch.id)).toBe("sending")
  }, 120_000)
})

describe("sendBatch duplicate numbers", () => {
  it("sends one message when two contacts share a number", async () => {
    const { batch, rows } = await seedBatch(1)
    await seedRecipient(rows[0].apt.id, rows[0].phone.number)

    await sendBatch({ batchId: batch.id })

    const sent = await messagesOf(batch.id)
    expect(sent).toHaveLength(1)
    expect(sent[0].phoneNumberId).toBe(rows[0].phone.id)
  })

  it("sends one message when a contact stores the same number twice", async () => {
    const { db } = testDb
    const { batch, rows } = await seedBatch(1)
    const [link] = await db.select().from(apartmentContacts)
    await createPhoneNumber(db, {
      contactId: link.contactId,
      number: rows[0].phone.number,
    })

    await sendBatch({ batchId: batch.id })

    expect(await messagesOf(batch.id)).toHaveLength(1)
  })
})

describe("sendWarning atomicity", () => {
  it("creates one warning per invoice under concurrent calls", async () => {
    const { batch, rows } = await seedBatch(2, "completed")
    const invoiceIds = rows.map((r) => r.invoice.id)

    const values = settled(
      await runConcurrently([
        () => sendWarning({ batchId: batch.id, invoiceIds }),
        () => sendWarning({ batchId: batch.id, invoiceIds }),
      ])
    )

    expect(values.filter((v) => v.ok)).toHaveLength(1)
    const warnings = (await messagesOf(batch.id)).filter(
      (m) => m.templateType === "warning"
    )
    expect(warnings).toHaveLength(2)
    expect(await batchStatus(batch.id)).toBe("sending")
    expect(invokeBackgroundProcess).toHaveBeenCalledTimes(1)
  })

  it("rejects a second sequential warning as already warned", async () => {
    const { batch, rows } = await seedBatch(1, "completed")
    const invoiceIds = rows.map((r) => r.invoice.id)
    expect((await sendWarning({ batchId: batch.id, invoiceIds })).ok).toBe(true)
    await testDb.db
      .update(batchSessions)
      .set({ status: "completed" })
      .where(eq(batchSessions.id, batch.id))

    expect(await sendWarning({ batchId: batch.id, invoiceIds })).toEqual({
      ok: false,
      error: "تم إرسال تحذيرات لهذه الفواتير بالفعل",
    })
    expect(await batchStatus(batch.id)).toBe("completed")
  })

  it("applies the edited amount to the invoice and the warning text", async () => {
    const { batch, rows } = await seedBatch(1, "completed")
    const invoiceId = rows[0].invoice.id

    const result = await sendWarning({
      batchId: batch.id,
      invoiceIds: [invoiceId],
      amounts: { [invoiceId]: 777 },
    })

    expect(result.ok).toBe(true)
    const [inv] = await testDb.db
      .select({ total: invoices.total })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
    expect(inv.total).toBe(777)
    const [warning] = await messagesOf(batch.id)
    expect(warning.contents).toContain("777.00")
  })
})

describe("retryFailed atomicity", () => {
  it("flips failed rows once under concurrent calls and spares unknown and sending", async () => {
    const { db } = testDb
    const { batch, rows } = await seedBatch(1, "completed")
    const invoiceId = rows[0].invoice.id
    const statuses = ["failed", "failed", "unknown", "sending", "sent"] as const
    const created = []
    for (const status of statuses) {
      created.push(
        await createMessage(db, {
          invoiceId,
          status,
          errorReason: status === "failed" ? "boom" : null,
        })
      )
    }

    const values = settled(
      await runConcurrently([
        () => retryFailed({ batchId: batch.id }),
        () => retryFailed({ batchId: batch.id }),
      ])
    )

    expect(values.filter((v) => v.ok)).toHaveLength(1)
    const after = await db
      .select({ id: messages.id, status: messages.status })
      .from(messages)
      .where(
        inArray(
          messages.id,
          created.map((m) => m.id)
        )
      )
    const byId = new Map(after.map((m) => [m.id, m.status]))
    expect(created.map((m) => byId.get(m.id))).toEqual([
      "pending",
      "pending",
      "unknown",
      "sending",
      "sent",
    ])
    expect(await batchStatus(batch.id)).toBe("sending")
    expect(invokeBackgroundProcess).toHaveBeenCalledTimes(1)
  })

  it("reports no failed messages and leaves the batch completed", async () => {
    const { batch, rows } = await seedBatch(1, "completed")
    await createMessage(testDb.db, {
      invoiceId: rows[0].invoice.id,
      status: "unknown",
    })

    expect(await retryFailed({ batchId: batch.id })).toEqual({
      ok: false,
      error: "لا توجد رسائل فاشلة",
    })
    expect(await batchStatus(batch.id)).toBe("completed")
    expect(invokeBackgroundProcess).not.toHaveBeenCalled()
  })

  it("rejects a batch that is not completed", async () => {
    const { batch } = await seedBatch(1, "draft")
    expect(await retryFailed({ batchId: batch.id })).toEqual({
      ok: false,
      error: "الدفعة غير مكتملة",
    })
  })
})

describe("resumeSending", () => {
  it("errors when no message is pending", async () => {
    const { batch, rows } = await seedBatch(1, "sending")
    await createMessage(testDb.db, {
      invoiceId: rows[0].invoice.id,
      status: "sent",
    })

    expect(await resumeSending({ batchId: batch.id })).toEqual({
      ok: false,
      error: "لا توجد رسائل بانتظار الإرسال",
    })
    expect(invokeBackgroundProcess).not.toHaveBeenCalled()
  })

  it("rejects a batch that is not sending", async () => {
    const { batch } = await seedBatch(1, "completed")
    expect(await resumeSending({ batchId: batch.id })).toEqual({
      ok: false,
      error: "الدفعة ليست قيد الإرسال",
    })
  })

  it("rejects an unknown batch", async () => {
    expect(await resumeSending({ batchId: 99999 })).toEqual({
      ok: false,
      error: "الدفعة غير موجودة",
    })
  })

  it("dispatches when pending messages exist, including for concurrent calls", async () => {
    const { batch, rows } = await seedBatch(1, "sending")
    await createMessage(testDb.db, {
      invoiceId: rows[0].invoice.id,
      status: "pending",
    })

    const values = settled(
      await runConcurrently([
        () => resumeSending({ batchId: batch.id }),
        () => resumeSending({ batchId: batch.id }),
      ])
    )

    expect(values.every((v) => v.ok)).toBe(true)
    expect(invokeBackgroundProcess).toHaveBeenCalledTimes(2)
  })
})
