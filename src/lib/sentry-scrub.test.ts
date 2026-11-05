import { afterEach, describe, expect, it, vi } from "vitest"

import { parseSampleRate, scrubEvent } from "@/lib/sentry-scrub"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("scrubEvent", () => {
  it("redacts Yemeni phone numbers in every supported form", () => {
    const out = scrubEvent({
      message:
        "send to +967771234567, 967771234567, 00967771234567 and 771234567 and 0771234567",
    })
    expect(out.message).not.toMatch(/7\d{8}/)
    expect(out.message).not.toContain("967")
    expect(out.message).toContain("[redacted-phone]")
  })

  it("redacts phone numbers in nested fields", () => {
    const out = scrubEvent({
      exception: { values: [{ type: "Error", value: "bad +967711111111" }] },
      breadcrumbs: [{ message: "to 00967733333333", data: { to: "733333333" } }],
      request: {
        url: "https://x.test/a?to=967700000000",
        query_string: "phone=+967700000001",
        data: { phone: "700000002" },
      },
    })
    expect(JSON.stringify(out)).not.toMatch(/7\d{8}/)
  })

  it("redacts password and P query/body values", () => {
    const out = scrubEvent({
      request: {
        url: "https://sms.test/MainServlet?U=user&P=hunter2&M=hi&password=abc123",
        query_string: "U=user&P=hunter2&password=abc123",
        data: "U=user&P=hunter2&Password=zzz",
      },
      extra: { body: '{"password":"hunter2","u":"x"}' },
    })
    const json = JSON.stringify(out)
    expect(json).not.toContain("hunter2")
    expect(json).not.toContain("abc123")
    expect(json).not.toContain("zzz")
    expect(json).toContain("U=user")
  })

  it("redacts password-like keys on objects", () => {
    const out = scrubEvent({
      request: { data: { password: "hunter2", username: "ali" } },
    })
    expect(JSON.stringify(out)).not.toContain("hunter2")
    expect(JSON.stringify(out)).toContain("ali")
  })

  it("redacts bearer tokens", () => {
    const out = scrubEvent({
      request: { headers: { authorization: "Bearer abc.def-123" } },
      message: "failed with Bearer tok_ABC123",
    })
    const json = JSON.stringify(out)
    expect(json).not.toContain("abc.def-123")
    expect(json).not.toContain("tok_ABC123")
  })

  it("redacts the configured SMS password", () => {
    vi.stubEnv("ALAWAEL_PASSWORD", "Sup3r$ecretPw")
    const out = scrubEvent({ message: "gateway said Sup3r$ecretPw is wrong" })
    expect(out.message).not.toContain("Sup3r$ecretPw")
  })

  it("leaves unrelated data intact", () => {
    const event = {
      message: "Batch 42 failed at step 3",
      level: "error",
      tags: { route: "/batches/42" },
      timestamp: 1700000000,
      extra: { count: 12, ok: false, nothing: null },
    }
    expect(scrubEvent(event)).toEqual(event)
  })

  it("does not mutate the input", () => {
    const event = { message: "to 771234567" }
    scrubEvent(event)
    expect(event.message).toBe("to 771234567")
  })
})

describe("parseSampleRate", () => {
  it("parses valid rates and falls back otherwise", () => {
    expect(parseSampleRate("0.5", 0)).toBe(0.5)
    expect(parseSampleRate("1", 0)).toBe(1)
    expect(parseSampleRate(undefined, 0.2)).toBe(0.2)
    expect(parseSampleRate("abc", 0.2)).toBe(0.2)
    expect(parseSampleRate("2", 0.2)).toBe(0.2)
    expect(parseSampleRate("-1", 0.2)).toBe(0.2)
  })
})
