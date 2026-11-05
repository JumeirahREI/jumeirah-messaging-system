import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createLoginGuard,
  type LoginLimiter,
  type LoginLimiters,
} from "@/lib/server/login-attempts"
import { users } from "@/lib/server/schema"
import { createTestDb, type TestDb } from "@/test/db"
import { createUser } from "@/test/fixtures"

let testDb: TestDb
let session: unknown = null

const hoisted = vi.hoisted(() => ({
  guard: null as null | {
    check: (ip: string, username: string) => Promise<string>
    recordFailure: (ip: string, username: string) => Promise<void>
    recordSuccess: (ip: string, username: string) => Promise<void>
  },
  unstableUpdate: vi.fn(async () => null),
}))

vi.mock("@/lib/server/db", () => ({
  get db() {
    return testDb.db
  },
}))
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => session),
  unstable_update: hoisted.unstableUpdate,
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}))
vi.mock("@/lib/server/password-attempts", () => ({
  changePasswordGuard: {
    check: (ip: string, username: string) => hoisted.guard!.check(ip, username),
    recordFailure: (ip: string, username: string) =>
      hoisted.guard!.recordFailure(ip, username),
    recordSuccess: (ip: string, username: string) =>
      hoisted.guard!.recordSuccess(ip, username),
  },
}))

const { changePasswordAction } = await import("@/app/change-password/actions")
const { getCurrentUser } = await import("@/lib/server/auth-helpers")

vi.setConfig({ testTimeout: 30_000 })

function fakeLimiter(max: number): LoginLimiter & { used: Map<string, number> } {
  const used = new Map<string, number>()
  return {
    used,
    getRemaining: async (id) => ({ remaining: max - (used.get(id) ?? 0) }),
    limit: async (id) => {
      used.set(id, (used.get(id) ?? 0) + 1)
    },
    resetUsedTokens: async (id) => {
      used.delete(id)
    },
  }
}

let limiters: LoginLimiters & { user: ReturnType<typeof fakeLimiter> }

const CURRENT = "current-Pass-2024"
const NEW = "fresh-Harbor-7391"

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

async function makeUser(
  overrides: Partial<typeof users.$inferInsert> = {}
) {
  const row = await createUser(testDb.db, {
    password: await bcrypt.hash(CURRENT, 4),
    mustResetPassword: false,
    ...overrides,
  })
  session = {
    user: {
      id: row.id,
      fullname: row.fullname,
      username: row.username,
      isAdmin: false,
      mustResetPassword: row.mustResetPassword,
    },
    mustResetPassword: row.mustResetPassword,
    sessionVersion: row.sessionVersion,
  }
  return row
}

async function stored(id: number) {
  const [found] = await testDb.db.select().from(users).where(eq(users.id, id))
  return found
}

beforeAll(async () => {
  testDb = await createTestDb()
})

afterAll(() => testDb.cleanup())

beforeEach(() => {
  session = null
  hoisted.unstableUpdate.mockClear()
  limiters = { user: fakeLimiter(3), ip: fakeLimiter(30) }
  hoisted.guard = createLoginGuard(limiters, () => true)
})

describe("changePasswordAction", () => {
  it("rejects an unauthenticated caller", async () => {
    const result = await changePasswordAction(
      null,
      form({ newPassword: NEW, confirmPassword: NEW })
    )
    expect(result.error).toBeTruthy()
    expect(result.success).toBeUndefined()
  })

  it("rejects a wrong current password and counts it against the limiter", async () => {
    const user = await makeUser()
    const result = await changePasswordAction(
      null,
      form({
        currentPassword: "not-the-password",
        newPassword: NEW,
        confirmPassword: NEW,
      })
    )
    expect(result).toEqual({ error: "كلمة المرور الحالية غير صحيحة" })
    expect(limiters.user.used.get(`203.0.113.9|${user.id}`)).toBe(1)
    expect((await stored(user.id)).sessionVersion).toBe(0)
    expect(await bcrypt.compare(CURRENT, (await stored(user.id)).password)).toBe(
      true
    )
  })

  it("requires the current password when the database does not force a reset", async () => {
    const user = await makeUser()
    const result = await changePasswordAction(
      null,
      form({ newPassword: NEW, confirmPassword: NEW })
    )
    expect(result.error).toBe("كلمة المرور الحالية مطلوبة")
    expect(limiters.user.used.size).toBe(0)
    expect((await stored(user.id)).sessionVersion).toBe(0)
  })

  it("changes the password, bumps the version and re-issues the session", async () => {
    const user = await makeUser()
    const result = await changePasswordAction(
      null,
      form({
        currentPassword: CURRENT,
        newPassword: NEW,
        confirmPassword: NEW,
      })
    )
    expect(result).toEqual({ success: true })
    const after = await stored(user.id)
    expect(after.sessionVersion).toBe(1)
    expect(after.mustResetPassword).toBe(false)
    expect(await bcrypt.compare(NEW, after.password)).toBe(true)
    expect(hoisted.unstableUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ mustResetPassword: false, sessionVersion: 1 })
    )
  })

  it("invalidates the old session once the password changed", async () => {
    await makeUser()
    expect(await getCurrentUser()).not.toBeNull()
    await changePasswordAction(
      null,
      form({
        currentPassword: CURRENT,
        newPassword: NEW,
        confirmPassword: NEW,
      })
    )
    expect(await getCurrentUser()).toBeNull()
  })

  it("does not require the current password when the database forces a reset", async () => {
    const user = await makeUser({ mustResetPassword: true })
    const result = await changePasswordAction(
      null,
      form({ newPassword: NEW, confirmPassword: NEW })
    )
    expect(result).toEqual({ success: true })
    const after = await stored(user.id)
    expect(after.mustResetPassword).toBe(false)
    expect(after.sessionVersion).toBe(1)
  })

  it("trusts the database over the token for mustResetPassword", async () => {
    const forced = await makeUser({ mustResetPassword: true })
    session = {
      ...(session as object),
      user: { ...(session as { user: object }).user, mustResetPassword: false },
      mustResetPassword: false,
    }
    expect(
      (await changePasswordAction(null, form({ newPassword: NEW, confirmPassword: NEW })))
        .success
    ).toBe(true)
    expect((await stored(forced.id)).mustResetPassword).toBe(false)

    await makeUser({ mustResetPassword: false })
    session = {
      ...(session as object),
      user: { ...(session as { user: object }).user, mustResetPassword: true },
      mustResetPassword: true,
    }
    const result = await changePasswordAction(
      null,
      form({ newPassword: NEW, confirmPassword: NEW })
    )
    expect(result.error).toBe("كلمة المرور الحالية مطلوبة")
  })

  it.each([
    ["too short", "Ab3-xY9", "كلمة المرور يجب أن تكون 10 أحرف على الأقل"],
    ["common", "password123", "كلمة المرور شائعة جدًا"],
    ["same as current", CURRENT, "لا يمكن استخدام كلمة المرور الحالية"],
  ])("rejects a %s password", async (_label, candidate, message) => {
    const user = await makeUser()
    const result = await changePasswordAction(
      null,
      form({
        currentPassword: CURRENT,
        newPassword: candidate,
        confirmPassword: candidate,
      })
    )
    expect(result).toEqual({ error: message })
    expect((await stored(user.id)).sessionVersion).toBe(0)
    expect(limiters.user.used.size).toBe(0)
  })

  it("rejects a password containing the username", async () => {
    const user = await makeUser({ username: "salem.ali" })
    const candidate = "Salem.Ali-2024!"
    const result = await changePasswordAction(
      null,
      form({
        currentPassword: CURRENT,
        newPassword: candidate,
        confirmPassword: candidate,
      })
    )
    expect(result.error).toBe("لا يمكن أن تحتوي كلمة المرور على اسم المستخدم")
    expect((await stored(user.id)).sessionVersion).toBe(0)
  })

  it("rejects mismatched confirmation", async () => {
    await makeUser()
    const result = await changePasswordAction(
      null,
      form({
        currentPassword: CURRENT,
        newPassword: NEW,
        confirmPassword: `${NEW}x`,
      })
    )
    expect(result).toEqual({ error: "كلمتا المرور غير متطابقتين" })
  })

  it("locks out after repeated wrong current passwords, even for the right one", async () => {
    const user = await makeUser()
    const attempt = (currentPassword: string) =>
      changePasswordAction(
        null,
        form({ currentPassword, newPassword: NEW, confirmPassword: NEW })
      )
    for (let i = 0; i < 3; i++) await attempt("wrong-password-1")
    const locked = await attempt(CURRENT)
    expect(locked.success).toBeUndefined()
    expect(locked.error).toContain("محاولات كثيرة")
    expect((await stored(user.id)).sessionVersion).toBe(0)
  })

  it("fails closed in production when the limiter is unavailable", async () => {
    hoisted.guard = createLoginGuard(null, () => true)
    const user = await makeUser()
    const result = await changePasswordAction(
      null,
      form({
        currentPassword: CURRENT,
        newPassword: NEW,
        confirmPassword: NEW,
      })
    )
    expect(result.success).toBeUndefined()
    expect(result.error).toBeTruthy()
    expect((await stored(user.id)).sessionVersion).toBe(0)
  })
})
