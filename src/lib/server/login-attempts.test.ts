import { describe, expect, it, vi } from "vitest"

import {
  createLoginGuard,
  loginKeys,
  normalizeUsername,
  type LoginLimiter,
} from "@/lib/server/login-attempts"

function fakeLimiter(max: number) {
  const counts = new Map<string, number>()
  const limiter: LoginLimiter = {
    getRemaining: async (id) => ({
      remaining: Math.max(0, max - (counts.get(id) ?? 0)),
    }),
    limit: async (id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1)
      return {}
    },
    resetUsedTokens: async (id) => {
      counts.delete(id)
    },
  }
  return limiter
}

function guard(userMax = 3, ipMax = 10) {
  return createLoginGuard(
    { user: fakeLimiter(userMax), ip: fakeLimiter(ipMax) },
    () => true
  )
}

async function fail(
  g: ReturnType<typeof guard>,
  ip: string,
  user: string,
  n: number
) {
  for (let i = 0; i < n; i++) await g.recordFailure(ip, user)
}

describe("key composition", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeUsername("  Admin ")).toBe("admin")
    expect(loginKeys("1.1.1.1", " ADMIN ")).toEqual(
      loginKeys("1.1.1.1", "admin")
    )
  })

  it("separates ip and username", () => {
    expect(loginKeys("1.1.1.1", "a").userKey).not.toBe(
      loginKeys("1.1.1.2", "a").userKey
    )
    expect(loginKeys("1.1.1.1", "a").userKey).not.toBe(
      loginKeys("1.1.1.1", "b").userKey
    )
  })
})

describe("login guard", () => {
  it("locks after the failure budget is spent", async () => {
    const g = guard()
    await fail(g, "1.1.1.1", "alice", 3)
    expect(await g.check("1.1.1.1", "alice")).toBe("locked")
  })

  it("case and whitespace variants share a lockout", async () => {
    const g = guard()
    await fail(g, "1.1.1.1", "alice", 3)
    expect(await g.check("1.1.1.1", "  ALICE ")).toBe("locked")
  })

  it("does not lock another user or another ip", async () => {
    const g = guard()
    await fail(g, "1.1.1.1", "alice", 3)
    expect(await g.check("1.1.1.1", "bob")).toBe("ok")
    expect(await g.check("2.2.2.2", "alice")).toBe("ok")
  })

  it("locks an ip that exceeds the looser per-ip budget across usernames", async () => {
    const g = guard(3, 4)
    for (const u of ["a", "b", "c", "d"]) await g.recordFailure("1.1.1.1", u)
    expect(await g.check("1.1.1.1", "fresh")).toBe("locked")
    expect(await g.check("2.2.2.2", "fresh")).toBe("ok")
  })

  it("checking and succeeding do not consume budget", async () => {
    const g = guard()
    for (let i = 0; i < 20; i++) {
      expect(await g.check("1.1.1.1", "alice")).toBe("ok")
      await g.recordSuccess("1.1.1.1", "alice")
    }
  })

  it("success resets prior failures", async () => {
    const g = guard()
    await fail(g, "1.1.1.1", "alice", 2)
    await g.recordSuccess("1.1.1.1", "alice")
    await fail(g, "1.1.1.1", "alice", 2)
    expect(await g.check("1.1.1.1", "alice")).toBe("ok")
  })
})

describe("availability", () => {
  it("refuses in production when redis is not configured", async () => {
    expect(await createLoginGuard(null, () => true).check("ip", "u")).toBe(
      "unavailable"
    )
  })

  it("allows in development when redis is not configured", async () => {
    const g = createLoginGuard(null, () => false)
    expect(await g.check("ip", "u")).toBe("ok")
    await expect(g.recordFailure("ip", "u")).resolves.toBeUndefined()
  })

  it("refuses instead of throwing when redis errors", async () => {
    const broken: LoginLimiter = {
      getRemaining: vi.fn().mockRejectedValue(new Error("redis down")),
      limit: vi.fn().mockRejectedValue(new Error("redis down")),
      resetUsedTokens: vi.fn().mockRejectedValue(new Error("redis down")),
    }
    vi.spyOn(console, "error").mockImplementation(() => {})
    const g = createLoginGuard({ user: broken, ip: broken }, () => true)
    expect(await g.check("ip", "u")).toBe("unavailable")
    await expect(g.recordFailure("ip", "u")).resolves.toBeUndefined()
    await expect(g.recordSuccess("ip", "u")).resolves.toBeUndefined()
  })
})
