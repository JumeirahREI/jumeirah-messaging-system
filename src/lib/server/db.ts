import type { Client } from "@libsql/client"
import { createClient } from "@libsql/client"
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

export type DB = LibSQLDatabase<typeof schema>
export type { Client }

type Connection = { client: Client; db: DB }

declare global {
  var __dbConnection: Connection | undefined
}

const globalForDb = globalThis as typeof globalThis & {
  __dbConnection?: Connection
}

const GUARDED_METHODS = [
  "execute",
  "batch",
  "migrate",
  "transaction",
  "executeMultiple",
] as const

async function enableForeignKeys(execute: Client["execute"], isFile: boolean) {
  if (isFile) await execute("PRAGMA foreign_keys = ON")
  const result = await execute("PRAGMA foreign_keys")
  const enabled = Number(result.rows[0]?.[0]) === 1
  if (enabled) return
  const message =
    "Foreign key enforcement is OFF on the database connection / فرض المفاتيح الأجنبية غير مفعّل"
  if (isFile) throw new Error(message)
  console.warn(message)
}

function createConnection(): Connection {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set / متغير البيئة TURSO_DATABASE_URL غير مُعيَّن"
    )
  }
  const isFile = url.startsWith("file:")
  const client = createClient(
    isFile ? { url } : { url, authToken: process.env.TURSO_AUTH_TOKEN }
  )

  const ready = enableForeignKeys(client.execute.bind(client), isFile)
  ready.catch(() => {})

  for (const name of GUARDED_METHODS) {
    const original = (
      client[name] as (...args: unknown[]) => Promise<unknown>
    ).bind(client)
    Object.defineProperty(client, name, {
      value: async (...args: unknown[]) => {
        await ready
        return original(...args)
      },
    })
  }

  return { client, db: drizzle({ client, schema }) }
}

function getConnection(): Connection {
  return (globalForDb.__dbConnection ??= createConnection())
}

function lazy<T extends object>(pick: (connection: Connection) => T): T {
  return new Proxy({} as T, {
    get(_, property) {
      const target = pick(getConnection())
      const value = Reflect.get(target, property, target)
      return typeof value === "function" ? value.bind(target) : value
    },
    has: (_, property) => property in pick(getConnection()),
  })
}

export const client: Client = lazy((c) => c.client)
export const db: DB = lazy((c) => c.db)
