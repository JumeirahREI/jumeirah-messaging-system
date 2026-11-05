import { sql } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "@/test/db"

const open: TestDb[] = []

async function makeDb(): Promise<TestDb> {
  const testDb = await createTestDb()
  open.push(testDb)
  return testDb
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((t) => t.cleanup()))
})

describe("createTestDb", () => {
  it("applies the real migrations and creates every table", async () => {
    const testDb = await makeDb()
    const res = await testDb.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    const names = res.rows.map((r) => String(r.name))
    for (const table of [
      "users",
      "projects",
      "towers",
      "apartments",
      "contacts",
      "phone_numbers",
      "apartment_contacts",
      "batch_sessions",
      "invoices",
      "messages",
    ]) {
      expect(names).toContain(table)
    }
  })

  it("enables foreign key enforcement", async () => {
    const testDb = await makeDb()
    const res = await testDb.client.execute("PRAGMA foreign_keys")
    expect(Number(res.rows[0]?.foreign_keys)).toBe(1)
    await expect(
      testDb.client.execute(
        `INSERT INTO messages (invoice_id, phone_number_id, contents, template_type, created_by)
         VALUES (9999, 9999, 'x', 'notification', 1)`
      )
    ).rejects.toThrow(/FOREIGN KEY/i)
  })

  it("exposes a working drizzle db", async () => {
    const testDb = await makeDb()
    const rows = await testDb.db.all<{ one: number }>(sql`SELECT 1 AS one`)
    expect(rows[0]?.one).toBe(1)
  })

  it("returns isolated databases per call", async () => {
    const a = await makeDb()
    const b = await makeDb()
    await a.client.execute(
      "INSERT INTO users (fullname, username, password) VALUES ('A', 'only-in-a', 'x')"
    )
    const inA = await a.client.execute("SELECT count(*) AS c FROM users")
    const inB = await b.client.execute("SELECT count(*) AS c FROM users")
    expect(Number(inA.rows[0]?.c)).toBe(1)
    expect(Number(inB.rows[0]?.c)).toBe(0)
  })
})
