import { afterEach, describe, expect, it, vi } from "vitest"
import {
  adminUser,
  authHelpersModule,
  authModule,
  operatorUser,
  resetAuth,
  setTestUser,
} from "@/test/auth"

vi.mock("@/lib/server/auth-helpers", () => authHelpersModule())
vi.mock("@/auth", () => authModule())

const { requireRole, getCurrentUser } = await import(
  "@/lib/server/auth-helpers"
)
const { auth } = await import("@/auth")

afterEach(() => {
  resetAuth()
})

describe("auth test helpers", () => {
  it("has no user by default", async () => {
    expect(await getCurrentUser()).toBeNull()
    expect(await auth()).toBeNull()
    await expect(requireRole("operator")).rejects.toThrow()
  })

  it("lets an operator through operator checks but not admin checks", async () => {
    setTestUser(operatorUser({ id: 7 }))
    expect((await requireRole("operator")).id).toBe(7)
    await expect(requireRole("admin")).rejects.toThrow()
    expect((await auth())?.user.id).toBe(7)
  })

  it("lets an admin through admin checks", async () => {
    setTestUser(adminUser())
    expect((await requireRole("admin")).isAdmin).toBe(true)
    expect((await getCurrentUser())?.isAdmin).toBe(true)
  })

  it("resets back to anonymous", async () => {
    setTestUser(adminUser())
    resetAuth()
    expect(await getCurrentUser()).toBeNull()
  })
})
