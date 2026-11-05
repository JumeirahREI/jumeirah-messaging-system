import { beforeAll, describe, expect, it } from "vitest"

import { readSessionUpdate, signSessionUpdate } from "@/lib/server/session-proof"

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-12"
})

describe("session update proof", () => {
  it("accepts a signed version for the same user", () => {
    expect(readSessionUpdate(7, signSessionUpdate(7, 3))).toBe(3)
  })

  it("rejects a version signed for another user", () => {
    expect(readSessionUpdate(8, signSessionUpdate(7, 3))).toBeNull()
  })

  it("rejects a tampered version, a forged proof and malformed data", () => {
    const signed = signSessionUpdate(7, 3)
    expect(readSessionUpdate(7, { ...signed, sessionVersion: 4 })).toBeNull()
    expect(readSessionUpdate(7, { sessionVersion: 4, proof: "00" })).toBeNull()
    expect(readSessionUpdate(7, { sessionVersion: 4 })).toBeNull()
    expect(readSessionUpdate(7, null)).toBeNull()
    expect(readSessionUpdate(7, "x")).toBeNull()
  })
})
