import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "@/test/db"
import {
  createInvoice,
  createMessage,
  createPhoneNumber,
  createUser,
} from "@/test/fixtures"
import { batchSessions, messages, users } from "."

const MIGRATIONS = resolve(process.cwd(), "drizzle/migrations")

let ctx: TestDb | undefined
afterEach(async () => {
  await ctx?.cleanup()
  ctx = undefined
})

async function columns(client: Client, table: string) {
  const res = await client.execute(`PRAGMA table_info(${table})`)
  return new Map(
    res.rows.map((r) => [
      String(r.name),
      { notnull: Number(r.notnull) === 1, dflt: r.dflt_value as string | null },
    ])
  )
}

async function indexes(client: Client, table: string) {
  const res = await client.execute(`PRAGMA index_list(${table})`)
  return res.rows.map((r) => ({
    name: String(r.name),
    unique: Number(r.unique) === 1,
    partial: Number(r.partial) === 1,
  }))
}

describe("phase 1 schema", () => {
  it("adds the message columns", async () => {
    ctx = await createTestDb()
    const cols = await columns(ctx.client, "messages")
    expect(cols.get("claimed_at")).toMatchObject({ notnull: false })
    expect(cols.get("attempts")).toMatchObject({ notnull: true, dflt: "0" })
    expect(cols.get("gateway_message_id")).toMatchObject({ notnull: false })
    expect(cols.get("client_ref")).toMatchObject({ notnull: false })
    expect(cols.get("parts_sent")).toMatchObject({ notnull: true, dflt: "0" })
  })

  it("adds batch and user columns", async () => {
    ctx = await createTestDb()
    const batch = await columns(ctx.client, "batch_sessions")
    expect(batch.get("unknown")).toMatchObject({ notnull: true, dflt: "0" })
    expect(batch.get("runner_id")).toMatchObject({ notnull: false })
    expect(batch.get("runner_lease_until")).toMatchObject({ notnull: false })
    const user = await columns(ctx.client, "users")
    expect(user.get("session_version")).toMatchObject({
      notnull: true,
      dflt: "0",
    })
  })

  it("creates the batch indexes and partial unique indexes", async () => {
    ctx = await createTestDb()
    const batchIdx = (await indexes(ctx.client, "batch_sessions")).map(
      (i) => i.name
    )
    expect(batchIdx).toContain("batch_sessions_created_at_idx")
    expect(batchIdx).toContain("batch_sessions_project_status_idx")
    const msgIdx = await indexes(ctx.client, "messages")
    expect(msgIdx).toContainEqual(
      expect.objectContaining({
        name: "messages_live_unique_idx",
        unique: true,
        partial: true,
      })
    )
    expect(msgIdx).toContainEqual(
      expect.objectContaining({
        name: "messages_client_ref_unique_idx",
        unique: true,
        partial: true,
      })
    )
  })

  it("stores sending and unknown statuses and new defaults", async () => {
    ctx = await createTestDb()
    const sending = await createMessage(ctx.db, { status: "sending" })
    const unknown = await createMessage(ctx.db, { status: "unknown" })
    const rows = await ctx.db
      .select({ id: messages.id, status: messages.status })
      .from(messages)
    const byId = new Map(rows.map((r) => [r.id, r.status]))
    expect(byId.get(sending.id)).toBe("sending")
    expect(byId.get(unknown.id)).toBe("unknown")
    expect(sending).toMatchObject({ attempts: 0, partsSent: 0, clientRef: null })
    const batches = await ctx.db.select().from(batchSessions)
    expect(batches.every((b) => b.unknown === 0)).toBe(true)
    const user = await createUser(ctx.db)
    const [stored] = await ctx.db.select().from(users).where(eq(users.id, user.id))
    expect(stored.sessionVersion).toBe(0)
  })

  it("rejects a second live duplicate message", async () => {
    ctx = await createTestDb()
    const invoice = await createInvoice(ctx.db)
    const phone = await createPhoneNumber(ctx.db)
    const key = { invoiceId: invoice.id, phoneNumberId: phone.id }
    const first = await createMessage(ctx.db, key)
    await expect(createMessage(ctx.db, key)).rejects.toThrow()
    await expect(
      createMessage(ctx.db, { ...key, templateType: "warning" })
    ).resolves.toBeDefined()
    await ctx.db
      .update(messages)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(messages.id, first.id))
    await expect(createMessage(ctx.db, key)).resolves.toBeDefined()
  })

  it("enforces client_ref uniqueness only when set", async () => {
    ctx = await createTestDb()
    await createMessage(ctx.db, { clientRef: null })
    await createMessage(ctx.db, { clientRef: null })
    await createMessage(ctx.db, { clientRef: "ref-1" })
    await expect(
      createMessage(ctx.db, { clientRef: "ref-1" })
    ).rejects.toThrow()
  })
})

describe("upgrade from the 0004 schema", () => {
  it("reconciles duplicate live messages and keeps everything else", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jumeirah-upgrade-"))
    const folder = join(dir, "migrations")
    const client = createClient({ url: `file:${join(dir, "old.db")}` })
    try {
      await cp(MIGRATIONS, folder, { recursive: true })
      const journalPath = join(folder, "meta/_journal.json")
      const fullJournal = await readFile(journalPath, "utf8")
      const parsed = JSON.parse(fullJournal) as { entries: { idx: number }[] }
      expect(parsed.entries.length).toBeGreaterThan(5)
      await writeFile(
        journalPath,
        JSON.stringify({
          ...parsed,
          entries: parsed.entries.filter((e) => e.idx <= 4),
        })
      )
      const db = drizzle({ client })
      await migrate(db, { migrationsFolder: folder })

      const insert =
        "INSERT INTO messages (id, invoice_id, phone_number_id, contents, template_type, status, created_by) VALUES "
      await client.batch([
        "INSERT INTO users (id, fullname, username, password) VALUES (1, 'U', 'u', 'x')",
        "INSERT INTO projects (id, title, created_by) VALUES (1, 'P', 1)",
        "INSERT INTO towers (id, label, project_id, created_by) VALUES (1, 'T', 1, 1)",
        "INSERT INTO apartments (id, label, tower_id, project_id, created_by) VALUES (1, 'A', 1, 1, 1)",
        "INSERT INTO batch_sessions (id, title, project_id, created_by) VALUES (1, 'B', 1, 1)",
        "INSERT INTO invoices (id, batch_id, apartment_id, client_name, total, created_by) VALUES (1, 1, 1, 'C', 10, 1), (2, 1, 1, 'C', 10, 1), (3, 1, 1, 'C', 10, 1)",
        "INSERT INTO contacts (id, fullname, created_by) VALUES (1, 'C', 1)",
        "INSERT INTO phone_numbers (id, number, contact_id, created_by) VALUES (1, '971500000001', 1, 1), (2, '971500000002', 1, 1)",
        `${insert}(1,1,1,'m','notification','failed',1), (2,1,1,'m','notification','pending',1), (3,1,1,'m','notification','sent',1), (4,1,1,'m','notification','sent',1)`,
        `${insert}(5,2,1,'m','notification','failed',1), (6,2,1,'m','notification','pending',1), (7,2,1,'m','notification','pending',1)`,
        `${insert}(8,3,1,'m','notification','failed',1), (9,3,1,'m','notification','failed',1)`,
        `${insert}(10,1,1,'w','warning','pending',1), (11,1,2,'m','notification','pending',1)`,
        "INSERT INTO messages (id, invoice_id, phone_number_id, contents, template_type, status, created_by, deleted_at) VALUES (12,2,2,'m','notification','sent',1,'2026-01-01 00:00:00'), (13,2,2,'m','notification','sent',1,'2026-01-02 00:00:00')",
        `${insert}(14,2,2,'m','notification','failed',1)`,
      ])

      await writeFile(journalPath, fullJournal)
      await migrate(db, { migrationsFolder: folder })

      const res = await client.execute(
        "SELECT id, status, deleted_at, attempts, parts_sent FROM messages ORDER BY id"
      )
      const row = (id: number) => res.rows.find((r) => Number(r.id) === id)
      const live = res.rows
        .filter((r) => r.deleted_at === null)
        .map((r) => Number(r.id))
      expect(live).toEqual([3, 6, 8, 10, 11, 14])
      for (const id of [1, 2, 4, 5, 7, 9]) {
        expect(row(id)?.deleted_at).not.toBeNull()
      }
      expect(row(12)?.deleted_at).toBe("2026-01-01 00:00:00")
      expect(row(13)?.deleted_at).toBe("2026-01-02 00:00:00")
      expect(res.rows).toHaveLength(14)
      expect(row(3)).toMatchObject({ status: "sent", attempts: 0, parts_sent: 0 })
      expect(row(8)?.status).toBe("failed")
    } finally {
      client.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
