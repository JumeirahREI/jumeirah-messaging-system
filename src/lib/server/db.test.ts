import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type DbModule = typeof import("./db")
type Globals = { __dbClient?: unknown; __db?: unknown }

let dir: string

async function expectFkViolation(run: () => Promise<unknown>) {
  const error = await run().then(
    () => undefined,
    (e: unknown) => e
  )
  const cause = error instanceof Error ? error.cause : undefined
  const text = [error, cause].map((e) => (e instanceof Error ? e.message : "")).join(" ")
  expect(text).toMatch(/FOREIGN KEY/i)
}

const rejections: unknown[] = []
const onRejection = (reason: unknown) => rejections.push(reason)
const savedEnv = {
  url: process.env.TURSO_DATABASE_URL,
  token: process.env.TURSO_AUTH_TOKEN,
}

function resetGlobals() {
  const g = globalThis as Globals
  const client = g.__dbClient as { close?: () => void } | undefined
  client?.close?.()
  delete g.__dbClient
  delete g.__db
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

async function load(url: string | undefined): Promise<DbModule> {
  restoreEnv("TURSO_DATABASE_URL", url)
  vi.resetModules()
  return import("./db")
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jumeirah-dbts-"))
  rejections.length = 0
  process.on("unhandledRejection", onRejection)
  resetGlobals()
})

afterEach(async () => {
  process.off("unhandledRejection", onRejection)
  resetGlobals()
  restoreEnv("TURSO_DATABASE_URL", savedEnv.url)
  restoreEnv("TURSO_AUTH_TOKEN", savedEnv.token)
  await rm(dir, { recursive: true, force: true })
})

describe("db without TURSO_DATABASE_URL", () => {
  it("does not throw on import", async () => {
    await expect(load(undefined)).resolves.toBeDefined()
  })

  it("throws a descriptive error on first use", async () => {
    const mod = await load(undefined)
    expect(() => mod.db.select).toThrow(/TURSO_DATABASE_URL is not set/)
    expect(() => mod.client.execute).toThrow(/TURSO_DATABASE_URL is not set/)
  })
})

describe("db with a file: URL", () => {
  it("connects, enables foreign keys and produces no unhandled rejection", async () => {
    const mod = await load(`file:${join(dir, "a.db")}`)

    const res = await mod.client.execute("PRAGMA foreign_keys")
    await new Promise((r) => setTimeout(r, 20))

    expect(Number(Object.values(res.rows[0])[0])).toBe(1)
    expect(rejections).toEqual([])
  })

  it("reuses one client across accesses", async () => {
    const mod = await load(`file:${join(dir, "b.db")}`)
    await mod.client.execute("SELECT 1")
    const first = (globalThis as Globals).__dbClient
    await mod.client.execute("SELECT 1")
    expect(first).toBeDefined()
    expect((globalThis as Globals).__dbClient).toBe(first)
  })

  it("rejects a message with a bad invoice_id, also after transactions", async () => {
    const mod = await load(`file:${join(dir, "c.db")}`)
    await migrate(mod.db, {
      migrationsFolder: resolve(process.cwd(), "drizzle/migrations"),
    })
    const insertBad = () =>
      mod.db.run(
        sql`INSERT INTO messages (invoice_id, phone_number_id, contents, template_type, created_by) VALUES (999, 999, 'x', 'notification', 999)`
      )

    await expectFkViolation(insertBad)

    for (let i = 0; i < 2; i++) {
      await mod.db.transaction(async (tx) => {
        await tx.run(sql`SELECT 1`)
      })
      await expectFkViolation(insertBad)
    }
  })
})

describe("createTestDb foreign keys", () => {
  it("rejects a message with a bad invoice_id", async () => {
    const { createTestDb } = await import("@/test/db")
    const { createMessage } = await import("@/test/fixtures")
    const t = await createTestDb()
    try {
      await expectFkViolation(() => createMessage(t.db, { invoiceId: 99999 }))
    } finally {
      await t.cleanup()
    }
  })
})
