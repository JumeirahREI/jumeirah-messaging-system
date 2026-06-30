import bcrypt from "bcryptjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./db", () => {
  let result: unknown[] = []
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
  }
  return {
    db: {
      select: vi.fn(() => chain),
      __setResult: (rows: unknown[]) => {
        result = rows
      },
    },
  }
})

const { db } = await import("./db")
const { signSession, verifySession, authenticateUser, SESSION_COOKIE } =
  await import("./auth.server")

const GOOD_SECRET = "a-very-long-random-secret-for-testing-1234567890"
const OTHER_SECRET = "a-different-long-random-secret-for-testing-000000"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", GOOD_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("signSession / verifySession", () => {
  it("round-trips a valid token", async () => {
    const token = await signSession({ userId: 42 })
    const payload = await verifySession(token)
    expect(payload).toEqual({ userId: 42 })
  })

  it("rejects an expired token", async () => {
    vi.useFakeTimers()
    const token = await signSession({ userId: 7 })
    vi.advanceTimersByTime(60 * 60 * 8 * 1000 + 1000)
    const payload = await verifySession(token)
    expect(payload).toBeNull()
    vi.useRealTimers()
  })

  it("rejects a tampered token", async () => {
    const token = await signSession({ userId: 1 })
    const tampered = token.slice(0, -4) + "AAAA"
    const payload = await verifySession(tampered)
    expect(payload).toBeNull()
  })

  it("rejects a token signed with a different secret", async () => {
    vi.stubEnv("SESSION_SECRET", GOOD_SECRET)
    const token = await signSession({ userId: 1 })
    vi.stubEnv("SESSION_SECRET", OTHER_SECRET)
    const payload = await verifySession(token)
    expect(payload).toBeNull()
  })

  it("throws if SESSION_SECRET is missing or too short", async () => {
    vi.stubEnv("SESSION_SECRET", "short")
    await expect(signSession({ userId: 1 })).rejects.toThrow()
  })
})

describe("authenticateUser", () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash("correct-horse-battery", 12)
    ;(db as unknown as { __setResult: (r: unknown[]) => void }).__setResult([
      {
        id: 1,
        fullname: "System Administrator",
        username: "admin",
        password: passwordHash,
        isAdmin: true,
      },
    ])
  })

  it("returns the user on valid credentials", async () => {
    const user = await authenticateUser("admin", "correct-horse-battery")
    expect(user).toEqual({
      id: 1,
      fullname: "System Administrator",
      username: "admin",
      isAdmin: true,
    })
  })

  it("returns null on wrong password", async () => {
    const user = await authenticateUser("admin", "wrong-password")
    expect(user).toBeNull()
  })

  it("returns null when no user matched (soft-deleted or unknown)", async () => {
    ;(db as unknown as { __setResult: (r: unknown[]) => void }).__setResult([])
    const user = await authenticateUser("ghost", "anything")
    expect(user).toBeNull()
  })
})

describe("SESSION_COOKIE", () => {
  it("has a stable cookie name", () => {
    expect(SESSION_COOKIE).toBe("jumeirah_session")
  })
})
