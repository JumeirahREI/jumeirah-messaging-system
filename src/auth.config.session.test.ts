import { beforeAll, describe, expect, it } from "vitest"

import { authConfig } from "@/auth.config"
import { signSessionUpdate } from "@/lib/server/session-proof"

type JwtArgs = Parameters<typeof authConfig.callbacks.jwt>[0]
type SessionArgs = Parameters<typeof authConfig.callbacks.session>[0]

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-12"
})

const baseToken = { id: 5, sessionVersion: 2, mustResetPassword: true }

function runJwt(args: Partial<JwtArgs>) {
  return authConfig.callbacks.jwt({ token: { ...baseToken }, ...args } as JwtArgs)
}

describe("jwt callback sessionVersion", () => {
  it("stores the sessionVersion at sign-in", async () => {
    const token = await runJwt({
      token: {},
      user: { id: "5", sessionVersion: 4, isAdmin: false },
    })
    expect(token?.sessionVersion).toBe(4)
  })

  it("ignores an unsigned sessionVersion update", async () => {
    const token = await runJwt({
      trigger: "update",
      session: { sessionVersion: 9 },
    })
    expect(token?.sessionVersion).toBe(2)
  })

  it("accepts a sessionVersion update signed by the server", async () => {
    const token = await runJwt({
      trigger: "update",
      session: { mustResetPassword: false, ...signSessionUpdate(5, 3) },
    })
    expect(token?.sessionVersion).toBe(3)
    expect(token?.mustResetPassword).toBe(false)
  })

  it("rejects a proof signed for another user", async () => {
    const token = await runJwt({
      trigger: "update",
      session: signSessionUpdate(6, 3),
    })
    expect(token?.sessionVersion).toBe(2)
  })
})

describe("session callback", () => {
  it("exposes sessionVersion on the session", async () => {
    const session = await authConfig.callbacks.session({
      session: { user: {}, expires: "" },
      token: { ...baseToken, fullname: "A", username: "a" },
    } as unknown as SessionArgs)
    expect((session as { sessionVersion?: number }).sessionVersion).toBe(2)
  })
})
