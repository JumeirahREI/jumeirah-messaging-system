import { beforeEach, describe, expect, it, vi } from "vitest"
import { adminUser, operatorUser, resetAuth, setTestUser } from "@/test/auth"

type Limiter = { limit: (key: string) => Promise<{ success: boolean }> }

const holder = vi.hoisted(() => ({ limiter: null as Limiter | null }))

vi.mock("@/lib/server/auth-helpers", async () => {
  const helpers = await import("@/test/auth")
  return helpers.authHelpersModule()
})

vi.mock("@/lib/server/rate-limit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/server/rate-limit")>()
  return {
    checkRateLimit: actual.checkRateLimit,
    get mutationLimiter() {
      return holder.limiter
    },
  }
})

const { requireRoleRateLimited, parseIdInput, parseBatchIdInput } =
  await import("./action-guards")

beforeEach(() => {
  resetAuth()
  holder.limiter = null
})

describe("requireRoleRateLimited", () => {
  it("returns the user and keys the limiter by user id when under the limit", async () => {
    const limit = vi.fn(async () => ({ success: true }))
    holder.limiter = { limit }
    setTestUser(operatorUser({ id: 7 }))

    await expect(requireRoleRateLimited("operator")).resolves.toMatchObject({
      id: 7,
    })
    expect(limit).toHaveBeenCalledWith("mutation:7")
  })

  it("throws the too-many-attempts error when the limit is exceeded", async () => {
    holder.limiter = { limit: async () => ({ success: false }) }
    setTestUser(operatorUser())

    await expect(requireRoleRateLimited("operator")).rejects.toThrow(
      "محاولات كثيرة. حاول مرة أخرى لاحقًا"
    )
  })

  it("allows the call when no limiter is configured", async () => {
    holder.limiter = null
    setTestUser(operatorUser({ id: 3 }))

    await expect(requireRoleRateLimited("operator")).resolves.toMatchObject({
      id: 3,
    })
  })

  it("rejects an unauthenticated caller before consulting the limiter", async () => {
    const limit = vi.fn(async () => ({ success: true }))
    holder.limiter = { limit }

    await expect(requireRoleRateLimited("operator")).rejects.toThrow("غير مصرح")
    expect(limit).not.toHaveBeenCalled()
  })

  it("rejects a non-admin for the admin role before consulting the limiter", async () => {
    const limit = vi.fn(async () => ({ success: true }))
    holder.limiter = { limit }
    setTestUser(operatorUser())

    await expect(requireRoleRateLimited("admin")).rejects.toThrow(
      "هذه العملية تتطلب صلاحيات المسؤول"
    )
    expect(limit).not.toHaveBeenCalled()
  })

  it("accepts an admin for the admin role", async () => {
    setTestUser(adminUser())

    await expect(requireRoleRateLimited("admin")).resolves.toMatchObject({
      isAdmin: true,
    })
  })
})

describe("input parse helpers", () => {
  it("parseBatchIdInput returns the batch id", () => {
    expect(parseBatchIdInput({ batchId: 5 })).toBe(5)
  })

  it("parseBatchIdInput rejects non-objects and a non-numeric id", () => {
    expect(() => parseBatchIdInput(null)).toThrow("إدخال غير صالح")
    expect(() => parseBatchIdInput("x")).toThrow("إدخال غير صالح")
    expect(() => parseBatchIdInput({ batchId: "5" })).toThrow(
      "معرّف الدفعة مطلوب"
    )
  })

  it("parseIdInput returns the id", () => {
    expect(parseIdInput({ id: 9 })).toBe(9)
  })

  it("parseIdInput rejects non-objects and a missing id", () => {
    expect(() => parseIdInput(undefined)).toThrow("إدخال غير صالح")
    expect(() => parseIdInput({})).toThrow("المعرّف مطلوب")
  })
})
