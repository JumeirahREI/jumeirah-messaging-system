import { describe, expect, it } from "vitest"

import { redact } from "./redact"

describe("redact", () => {
  it("strips password query params", () => {
    const out = redact(
      "GET https://x.test/s?orgName=O&password=s3cr%26t&text=hi"
    )
    expect(out).not.toContain("s3cr")
    expect(out).toContain("orgName=O")
  })

  it("strips the P param used by the balance endpoint", () => {
    const out = redact("https://x.test/b?O=org&U=user&P=hunter2")
    expect(out).not.toContain("hunter2")
    expect(out).toContain("U=user")
  })

  it("removes configured secrets in raw and url-encoded form", () => {
    const out = redact("bad token p@ss w0rd and p%40ss%20w0rd", "p@ss w0rd")
    expect(out).not.toContain("p@ss")
    expect(out).not.toContain("p%40ss")
  })

  it("leaves unrelated text untouched", () => {
    expect(redact("connection reset")).toBe("connection reset")
  })

  it("ignores empty secrets", () => {
    expect(redact("abc", "")).toBe("abc")
  })
})
