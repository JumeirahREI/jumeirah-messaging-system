import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as schema from "@/lib/server/schema"
import type { DB } from "@/lib/server/db"

const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle/migrations")

export interface TestDb {
  db: DB
  client: Client
  cleanup: () => Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const dir = await mkdtemp(join(tmpdir(), `jumeirah-test-${randomUUID()}-`))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  await client.execute("PRAGMA foreign_keys = ON")
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  await client.execute("PRAGMA foreign_keys = ON")
  return {
    db,
    client,
    cleanup: async () => {
      client.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
