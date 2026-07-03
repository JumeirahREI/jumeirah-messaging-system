import type { Client } from "@libsql/client"
import { createClient } from "@libsql/client"
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

declare global {
  var __dbClient: Client | undefined
  var __db: LibSQLDatabase<typeof schema> | undefined
}

function createDb(): {
  client: Client
  db: LibSQLDatabase<typeof schema>
} {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set")
  }
  const authToken = process.env.TURSO_AUTH_TOKEN
  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken }
  )
  void client.execute("PRAGMA foreign_keys = ON")
  const db = drizzle({ client, schema })
  return { client, db }
}

const globalForDb = globalThis as typeof globalThis & {
  __dbClient?: Client
  __db?: LibSQLDatabase<typeof schema>
}

function getSingleton(): {
  client: Client
  db: LibSQLDatabase<typeof schema>
} {
  if (globalForDb.__dbClient && globalForDb.__db) {
    return { client: globalForDb.__dbClient, db: globalForDb.__db }
  }
  const created = createDb()
  globalForDb.__dbClient = created.client
  globalForDb.__db = created.db
  return created
}

const hasServerEnv = Boolean(process.env.TURSO_DATABASE_URL)

export const client: Client = hasServerEnv
  ? getSingleton().client
  : (null as unknown as Client)
export const db: LibSQLDatabase<typeof schema> = hasServerEnv
  ? getSingleton().db
  : (null as unknown as LibSQLDatabase<typeof schema>)

export type DB = LibSQLDatabase<typeof schema>
