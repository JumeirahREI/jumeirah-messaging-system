import bcrypt from "bcryptjs"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { users } from "@/lib/server/schema"
import { runConcurrently } from "@/test/concurrency"
import { createTestDb, type TestDb } from "@/test/db"
import { createUser } from "@/test/fixtures"
import {
  adminUser,
  authHelpersModule,
  resetAuth,
  setTestUser,
} from "@/test/auth"

let testDb: TestDb

vi.mock("@/lib/server/db", () => ({
  get db() {
    return testDb.db
  },
}))
vi.mock("@/lib/server/auth-helpers", () => authHelpersModule())

const {
  createUser: createUserAction,
  updateUser,
  resetUserPassword,
  softDeleteUser,
} = await import("@/lib/server/reference/users")

vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  testDb = await createTestDb()
})

afterAll(() => testDb.cleanup())

beforeEach(async () => {
  resetAuth()
  await testDb.db.update(users).set({ isAdmin: false })
})

async function row(id: number) {
  const [found] = await testDb.db.select().from(users).where(eq(users.id, id))
  return found
}

async function adminCount() {
  const [r] = await testDb.db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.isAdmin} = 1 and ${users.deletedAt} is null`)
  return r.n
}

async function makeAdmin() {
  return createUser(testDb.db, { isAdmin: true })
}

async function actAsOutsider() {
  const outsider = await createUser(testDb.db, { isAdmin: false })
  actAs(outsider.id)
}

function actAs(id: number) {
  setTestUser(adminUser({ id }))
}

describe("temporary passwords", () => {
  it("createUser returns a random temporary password and stores only its hash", async () => {
    const caller = await makeAdmin()
    actAs(caller.id)
    const a = await createUserAction({
      fullname: "A",
      username: "temp.a",
      isAdmin: false,
    })
    const b = await createUserAction({
      fullname: "B",
      username: "temp.b",
      isAdmin: false,
    })
    if (!a.ok || !b.ok) throw new Error("createUser failed")
    const first = a.data.temporaryPassword
    expect(first).not.toBe(b.data.temporaryPassword)
    expect(first.length).toBeGreaterThanOrEqual(12)
    expect(first).not.toBe("temp.a")
    const stored = await row(a.data.id)
    expect(stored.password).not.toBe(first)
    expect(stored.password).toMatch(/^\$2[aby]\$12\$/)
    expect(await bcrypt.compare(first, stored.password)).toBe(true)
    expect(stored.mustResetPassword).toBe(true)
  })

  it("resetUserPassword bumps the session version and returns a fresh temporary password", async () => {
    const caller = await makeAdmin()
    const target = await createUser(testDb.db, { username: "reset.me" })
    actAs(caller.id)
    const first = await resetUserPassword({ id: target.id })
    const second = await resetUserPassword({ id: target.id })
    if (!first.ok || !second.ok) throw new Error("reset failed")
    expect(first.data.temporaryPassword).not.toBe(second.data.temporaryPassword)
    expect(first.data.temporaryPassword.length).toBeGreaterThanOrEqual(12)
    expect(second.data.temporaryPassword).not.toBe("reset.me")
    const stored = await row(target.id)
    expect(stored.sessionVersion).toBe(2)
    expect(stored.mustResetPassword).toBe(true)
    expect(stored.password).not.toBe(second.data.temporaryPassword)
    expect(await bcrypt.compare(second.data.temporaryPassword, stored.password)).toBe(
      true
    )
  })
})

describe("session version bumps", () => {
  it("bumps on role change and soft delete but not on a plain edit", async () => {
    const caller = await makeAdmin()
    await makeAdmin()
    const target = await createUser(testDb.db, {
      username: "bump.me",
      fullname: "Bump",
      isAdmin: true,
    })
    actAs(caller.id)

    await updateUser({
      id: target.id,
      fullname: "Renamed",
      username: "bump.me",
      isAdmin: true,
    })
    expect((await row(target.id)).sessionVersion).toBe(0)

    await updateUser({
      id: target.id,
      fullname: "Renamed",
      username: "bump.me",
      isAdmin: false,
    })
    expect((await row(target.id)).sessionVersion).toBe(1)

    await softDeleteUser({ id: target.id })
    expect((await row(target.id)).sessionVersion).toBe(2)
  })
})

describe("last admin protection", () => {
  it("refuses to demote or delete the only admin", async () => {
    const only = await makeAdmin()
    await actAsOutsider()
    const demote = await updateUser({
      id: only.id,
      fullname: only.fullname,
      username: only.username,
      isAdmin: false,
    })
    expect(demote).toEqual({
      ok: false,
      error: "لا يمكن تخفيض صلاحيات آخر مسؤول",
    })
    expect(await softDeleteUser({ id: only.id })).toEqual({
      ok: false,
      error: "لا يمكن حذف آخر مسؤول",
    })
    expect(await adminCount()).toBe(1)
  })

  it("refuses self-delete", async () => {
    const admin = await makeAdmin()
    await makeAdmin()
    actAs(admin.id)
    expect(await softDeleteUser({ id: admin.id })).toEqual({
      ok: false,
      error: "لا يمكن حذف حسابك الحالي",
    })
  })

  it("leaves exactly one admin after concurrent demotion of the last two", async () => {
    for (let round = 0; round < 5; round++) {
      await testDb.db.update(users).set({ isAdmin: false })
      const a = await makeAdmin()
      const b = await makeAdmin()
      actAs(a.id)
      await runConcurrently(
        [a, b].map((u) => () =>
          updateUser({
            id: u.id,
            fullname: u.fullname,
            username: u.username,
            isAdmin: false,
          })
        )
      )
      expect(await adminCount()).toBe(1)
    }
  })

  it("leaves exactly one admin after concurrent deletion by an outside admin", async () => {
    for (let round = 0; round < 5; round++) {
      await testDb.db.update(users).set({ isAdmin: false })
      const a = await makeAdmin()
      const b = await makeAdmin()
      await actAsOutsider()
      await runConcurrently(
        [a, b].map((u) => () => softDeleteUser({ id: u.id }))
      )
      expect(await adminCount()).toBe(1)
    }
  })
})

describe("username normalization", () => {
  it("stores usernames trimmed and lowercased on create and update", async () => {
    const caller = await makeAdmin()
    actAs(caller.id)
    const created = await createUserAction({
      fullname: "Alice",
      username: "  Alice.Smith ",
      isAdmin: false,
    })
    if (!created.ok) throw new Error(created.error)
    expect(created.data.username).toBe("alice.smith")

    const updated = await updateUser({
      id: created.data.id,
      fullname: "Alice",
      username: " ALICE.Smith2 ",
      isAdmin: false,
    })
    if (!updated.ok) throw new Error(updated.error)
    expect(updated.data.username).toBe("alice.smith2")
  })

  it("rejects case-insensitive duplicates, including soft-deleted users", async () => {
    const caller = await makeAdmin()
    actAs(caller.id)
    await createUser(testDb.db, { username: "Existing.User" })
    await createUser(testDb.db, {
      username: "Gone.User",
      deletedAt: "2026-01-01 00:00:00",
    })
    const taken = "اسم المستخدم مستخدم مسبقًا"
    for (const username of ["existing.user", "EXISTING.USER ", "gone.user"]) {
      expect(
        await createUserAction({ fullname: "X", username, isAdmin: false })
      ).toEqual({ ok: false, error: taken })
    }
  })

  it("rejects renaming onto another user's name but allows a case-only change of one's own", async () => {
    const caller = await makeAdmin()
    actAs(caller.id)
    await createUser(testDb.db, { username: "taken.name" })
    const mine = await createUser(testDb.db, { username: "mine.name" })
    expect(
      await updateUser({
        id: mine.id,
        fullname: mine.fullname,
        username: "TAKEN.name",
        isAdmin: false,
      })
    ).toEqual({ ok: false, error: "اسم المستخدم مستخدم مسبقًا" })
    const ok = await updateUser({
      id: mine.id,
      fullname: mine.fullname,
      username: "MINE.name",
      isAdmin: false,
    })
    expect(ok.ok).toBe(true)
  })
})
