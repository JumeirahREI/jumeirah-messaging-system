import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { users } from "@/lib/server/schema"
import { createTestDb, type TestDb } from "@/test/db"
import { createUser } from "@/test/fixtures"

let testDb: TestDb
let session: unknown = null

const requestCaches = vi.hoisted(() => [] as Array<Map<string, unknown>>)

vi.mock("@/lib/server/db", () => ({
  get db() {
    return testDb.db
  },
}))

vi.mock("@/auth", () => ({ auth: vi.fn(async () => session) }))

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const store = new Map<string, unknown>()
      requestCaches.push(store)
      return (...args: A): R => {
        const key = JSON.stringify(args)
        if (!store.has(key)) store.set(key, fn(...args))
        return store.get(key) as R
      }
    },
  }
})

const { getCurrentUser, requireRole } = await import(
  "@/lib/server/auth-helpers"
)

const NOT_SIGNED_IN = "غير مصرح: يجب تسجيل الدخول"
const NOT_ADMIN = "غير مصرح: هذه العملية تتطلب صلاحيات المسؤول"

function sessionFor(
  row: { id: number; fullname: string; username: string },
  token: {
    isAdmin?: boolean
    mustResetPassword?: boolean
    sessionVersion?: number
  } = {}
) {
  const isAdmin = token.isAdmin ?? false
  const mustResetPassword = token.mustResetPassword ?? false
  return {
    user: {
      id: row.id,
      fullname: row.fullname,
      username: row.username,
      isAdmin,
      mustResetPassword,
    },
    mustResetPassword,
    sessionVersion: token.sessionVersion ?? 0,
  }
}

beforeAll(async () => {
  testDb = await createTestDb()
})

afterAll(() => testDb.cleanup())

beforeEach(() => {
  session = null
  for (const store of requestCaches) store.clear()
})

describe("getCurrentUser / requireRole revalidation", () => {
  it("returns null and rejects without a session", async () => {
    expect(await getCurrentUser()).toBeNull()
    await expect(requireRole("operator")).rejects.toThrow(NOT_SIGNED_IN)
  })

  it("accepts a token that matches the database row", async () => {
    const row = await createUser(testDb.db, { isAdmin: true })
    session = sessionFor(row, { isAdmin: true })
    expect(await getCurrentUser()).toMatchObject({
      id: row.id,
      username: row.username,
      isAdmin: true,
    })
    await expect(requireRole("admin")).resolves.toMatchObject({ id: row.id })
  })

  it("rejects a still-valid token of a soft-deleted user", async () => {
    const row = await createUser(testDb.db)
    session = sessionFor(row)
    await testDb.db
      .update(users)
      .set({ deletedAt: "2026-01-01 00:00:00" })
      .where(eq(users.id, row.id))
    expect(await getCurrentUser()).toBeNull()
    await expect(requireRole("operator")).rejects.toThrow(NOT_SIGNED_IN)
  })

  it("rejects a token of a user that no longer exists", async () => {
    session = sessionFor({ id: 987654, fullname: "x", username: "x" })
    expect(await getCurrentUser()).toBeNull()
  })

  it("rejects a token whose session version was bumped", async () => {
    const row = await createUser(testDb.db)
    session = sessionFor(row, { sessionVersion: 0 })
    await testDb.db
      .update(users)
      .set({ sessionVersion: 1 })
      .where(eq(users.id, row.id))
    expect(await getCurrentUser()).toBeNull()
    await expect(requireRole("operator")).rejects.toThrow(NOT_SIGNED_IN)
  })

  it("treats a token without a session version as version 0", async () => {
    const row = await createUser(testDb.db)
    const { sessionVersion: _omitted, ...withoutVersion } = sessionFor(row)
    session = withoutVersion
    expect(await getCurrentUser()).toMatchObject({ id: row.id })
  })

  it("fails requireRole('admin') immediately for a demoted admin", async () => {
    const row = await createUser(testDb.db, { isAdmin: false })
    session = sessionFor(row, { isAdmin: true })
    await expect(requireRole("admin")).rejects.toThrow(NOT_ADMIN)
    expect((await getCurrentUser())?.isAdmin).toBe(false)
  })

  it("takes mustResetPassword from the database, not the token", async () => {
    const forced = await createUser(testDb.db, { mustResetPassword: true })
    session = sessionFor(forced, { mustResetPassword: false })
    expect((await getCurrentUser())?.mustResetPassword).toBe(true)

    const free = await createUser(testDb.db, { mustResetPassword: false })
    session = sessionFor(free, { mustResetPassword: true })
    expect((await getCurrentUser())?.mustResetPassword).toBe(false)
  })

  it("queries the database once per request", async () => {
    const row = await createUser(testDb.db, { isAdmin: true })
    session = sessionFor(row, { isAdmin: true })
    const execute = vi.spyOn(testDb.client, "execute")
    await getCurrentUser()
    await requireRole("operator")
    await requireRole("admin")
    expect(execute).toHaveBeenCalledTimes(1)
    execute.mockRestore()
  })
})
