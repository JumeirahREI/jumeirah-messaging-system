import bcrypt from "bcryptjs"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createTestDb, type TestDb } from "@/test/db"
import { createUser } from "@/test/fixtures"

let testDb: TestDb

vi.mock("@/lib/server/db", () => ({
  get db() {
    return testDb.db
  },
}))

const { authenticateUser } = await import("@/lib/server/auth-db")

beforeAll(async () => {
  testDb = await createTestDb()
  await createUser(testDb.db, {
    username: "Admin.Mixed",
    password: await bcrypt.hash("correct-horse-battery", 4),
  })
})

afterAll(() => testDb.cleanup())

describe("authenticateUser (real db)", () => {
  it("logs in regardless of username case and whitespace", async () => {
    for (const name of ["Admin.Mixed", "admin.mixed", "  ADMIN.MIXED "]) {
      const user = await authenticateUser(name, "correct-horse-battery")
      expect(user?.username).toBe("Admin.Mixed")
    }
  })

  it("runs a bcrypt compare when the user does not exist", async () => {
    const spy = vi.spyOn(bcrypt, "compare")
    expect(await authenticateUser("ghost", "whatever")).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    const [, hash] = spy.mock.calls[0] as [string, string]
    expect(hash).toMatch(/^\$2[aby]\$\d\d\$/)
  })

  it("still rejects a wrong password", async () => {
    expect(await authenticateUser("admin.mixed", "nope")).toBeNull()
  })
})
