import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { verifyBearer } from "@/lib/server/function-auth"

describe("verifyBearer", () => {
  it("accepts the right secret", () => {
    expect(verifyBearer("Bearer s3cret-value", "s3cret-value")).toBe(true)
  })

  it("rejects a wrong secret", () => {
    expect(verifyBearer("Bearer nope", "s3cret-value")).toBe(false)
  })

  it("rejects secrets of different lengths without throwing", () => {
    expect(verifyBearer("Bearer s3cret", "s3cret-value")).toBe(false)
    expect(verifyBearer("Bearer s3cret-value-and-more", "s3cret-value")).toBe(
      false
    )
  })

  it("fails closed when the secret is empty, undefined or whitespace", () => {
    expect(verifyBearer("Bearer ", "")).toBe(false)
    expect(verifyBearer("Bearer", "")).toBe(false)
    expect(verifyBearer("Bearer ", undefined)).toBe(false)
    expect(verifyBearer("Bearer x", undefined)).toBe(false)
    expect(verifyBearer("Bearer    ", "   ")).toBe(false)
    expect(verifyBearer("Bearer x", "   ")).toBe(false)
  })

  it("rejects a missing header", () => {
    expect(verifyBearer(null, "s3cret-value")).toBe(false)
    expect(verifyBearer(undefined, "s3cret-value")).toBe(false)
    expect(verifyBearer("", "s3cret-value")).toBe(false)
  })

  it("rejects a header without the Bearer scheme", () => {
    expect(verifyBearer("s3cret-value", "s3cret-value")).toBe(false)
    expect(verifyBearer("Basic s3cret-value", "s3cret-value")).toBe(false)
  })

  it("does not accept a digest of the secret as the secret", () => {
    const digest = createHash("sha256").update("abc").digest("hex")
    expect(verifyBearer(`Bearer ${digest}`, "abc")).toBe(false)
  })
})
