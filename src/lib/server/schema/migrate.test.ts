import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"
import {
  assertMigrationAllowed,
  runMigrations,
} from "../../../../scripts/migrate"

describe("runMigrations", () => {
  it("is idempotent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jumeirah-migrate-"))
    const client = createClient({ url: `file:${join(dir, "m.db")}` })
    try {
      const db = drizzle({ client })
      await runMigrations(db)
      const count = async () =>
        Number(
          (await client.execute("SELECT count(*) AS n FROM __drizzle_migrations"))
            .rows[0].n
        )
      const first = await count()
      await runMigrations(db)
      expect(first).toBeGreaterThan(5)
      expect(await count()).toBe(first)
      const cols = await client.execute("PRAGMA table_info(users)")
      expect(cols.rows.map((r) => r.name)).toContain("session_version")
    } finally {
      client.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("assertMigrationAllowed", () => {
  it("allows production and unset CONTEXT", () => {
    expect(() => assertMigrationAllowed({ CONTEXT: "production" })).not.toThrow()
    expect(() => assertMigrationAllowed({})).not.toThrow()
  })

  it("refuses deploy previews and branch deploys", () => {
    for (const CONTEXT of ["deploy-preview", "branch-deploy", "dev"]) {
      expect(() => assertMigrationAllowed({ CONTEXT })).toThrow(/CONTEXT/)
    }
  })

  it("can be overridden explicitly", () => {
    expect(() =>
      assertMigrationAllowed({
        CONTEXT: "deploy-preview",
        ALLOW_NON_PRODUCTION_MIGRATE: "1",
      })
    ).not.toThrow()
  })
})
