import type { Client } from "@libsql/client"
import { createClient } from "@libsql/client"
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

declare global {
  var __dbClient: Client | undefined
  var __db: LibSQLDatabase<typeof schema> | undefined
}

function createDb(): { client: Client; db: LibSQLDatabase<typeof schema> } {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error("TURSO_DATABASE_URL is not set")
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

const singleton = globalForDb.__dbClient
  ? {
      client: globalForDb.__dbClient,
      db: globalForDb.__db as LibSQLDatabase<typeof schema>,
    }
  : createDb()

if (!globalForDb.__dbClient) {
  globalForDb.__dbClient = singleton.client
  globalForDb.__db = singleton.db
}

export const client: Client = singleton.client
export const db: LibSQLDatabase<typeof schema> = singleton.db

export type DB = typeof db
