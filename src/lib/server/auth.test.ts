import bcrypt from "bcryptjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/db", () => {
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

const { db } = await import("@/lib/server/db")
const { authenticateUser } = await import("@/lib/server/auth-db")

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

  afterEach(() => {
    vi.restoreAllMocks()
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
