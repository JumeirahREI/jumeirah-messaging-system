import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

type MigrateDb = Parameters<typeof migrate>[0]
type Env = Record<string, string | undefined>

const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle/migrations")

export function assertMigrationAllowed(env: Env): void {
  const { CONTEXT, ALLOW_NON_PRODUCTION_MIGRATE } = env
  if (!CONTEXT || CONTEXT === "production") return
  if (ALLOW_NON_PRODUCTION_MIGRATE === "1") return
  throw new Error(
    `Refusing to migrate: CONTEXT is "${CONTEXT}", not "production". Set ALLOW_NON_PRODUCTION_MIGRATE=1 to override.`
  )
}

export async function runMigrations(db: MigrateDb): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}

async function main(env: Env): Promise<void> {
  try {
    assertMigrationAllowed(env)
  } catch (error) {
    console.log(`Skipping migrations. ${(error as Error).message}`)
    return
  }
  const url = env.TURSO_DATABASE_URL
  if (!url) throw new Error("TURSO_DATABASE_URL is required")
  const client = createClient({ url, authToken: env.TURSO_AUTH_TOKEN })
  try {
    await runMigrations(drizzle({ client }))
    console.log("Migrations applied")
  } finally {
    client.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
