import { AuthError, CredentialsSignin } from "@auth/core/errors"
import { beforeEach, describe, expect, it, vi } from "vitest"

const signIn = vi.hoisted(() => vi.fn())
const guard = vi.hoisted(() => ({
  check: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}))

vi.mock("next-auth", () => ({ AuthError, CredentialsSignin }))
vi.mock("@/auth", () => ({ signIn, signOut: vi.fn() }))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nf-client-connection-ip": "1.2.3.4" }),
}))
vi.mock("@/lib/server/login-attempts", () => ({ loginGuard: guard }))

const { loginAction } = await import("@/app/login/actions")

function form(username = " Alice ", password = "pw") {
  const f = new FormData()
  f.set("username", username)
  f.set("password", password)
  return f
}

beforeEach(() => {
  signIn.mockReset()
  guard.check.mockReset().mockResolvedValue("ok")
  guard.recordFailure.mockReset().mockResolvedValue(undefined)
  guard.recordSuccess.mockReset().mockResolvedValue(undefined)
})

describe("loginAction", () => {
  it("succeeds and resets the budget", async () => {
    signIn.mockResolvedValue(undefined)
    expect(await loginAction(null, form())).toEqual({ success: true })
    expect(guard.recordSuccess).toHaveBeenCalledWith("1.2.3.4", " Alice ")
    expect(guard.recordFailure).not.toHaveBeenCalled()
  })

  it("maps CredentialsSignin to invalid credentials and records a failure", async () => {
    signIn.mockRejectedValue(new CredentialsSignin())
    expect(await loginAction(null, form())).toEqual({
      error: "بيانات الدخول غير صحيحة",
    })
    expect(guard.recordFailure).toHaveBeenCalledWith("1.2.3.4", " Alice ")
  })

  it("maps other errors to a server error without recording a failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    signIn.mockRejectedValue(new Error("db down"))
    const result = await loginAction(null, form())
    expect(result.error).toBe("حدث خطأ في الخادم. حاول مرة أخرى لاحقاً")
    expect(spy).toHaveBeenCalled()
    expect(guard.recordFailure).not.toHaveBeenCalled()
  })

  it("refuses when locked without calling signIn", async () => {
    guard.check.mockResolvedValue("locked")
    const result = await loginAction(null, form())
    expect(result.error).toBe("محاولات كثيرة فاشلة. حاول مرة أخرى بعد 15 دقيقة")
    expect(signIn).not.toHaveBeenCalled()
  })

  it("refuses with a clear message when the limiter is unavailable", async () => {
    guard.check.mockResolvedValue("unavailable")
    const result = await loginAction(null, form())
    expect(result.error).toBe(
      "تعذر التحقق من محاولات الدخول حالياً. حاول مرة أخرى لاحقاً"
    )
    expect(signIn).not.toHaveBeenCalled()
  })
})
