import { afterEach, describe, expect, it, vi } from "vitest"

async function load() {
  vi.resetModules()
  return import("@/auth.config")
}

afterEach(() => vi.resetModules())

describe("redirect callback", () => {
  it("returns baseUrl for malformed urls instead of throwing", async () => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(32))
    const { authConfig } = await load()
    const baseUrl = "https://app.example.com"
    expect(authConfig.callbacks.redirect({ url: "http://[bad", baseUrl })).toBe(
      baseUrl
    )
  })

  it("keeps same-origin and relative urls, rejects foreign and protocol-relative", async () => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(32))
    const { authConfig } = await load()
    const baseUrl = "https://app.example.com"
    const r = authConfig.callbacks.redirect
    expect(r({ url: "/batches", baseUrl })).toBe(
      "https://app.example.com/batches"
    )
    expect(r({ url: "https://app.example.com/x", baseUrl })).toBe(
      "https://app.example.com/x"
    )
    expect(r({ url: "https://evil.com/x", baseUrl })).toBe(baseUrl)
    expect(r({ url: "//evil.com/x", baseUrl })).toBe(baseUrl)
  })
})

describe("AUTH_SECRET guard", () => {
  it("throws in production without a secret, even on Netlify", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NETLIFY", "true")
    vi.stubEnv("AUTH_SECRET", "")
    await expect(load()).rejects.toThrow(/AUTH_SECRET/)
  })

  it("loads in production with a secret", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("AUTH_SECRET", "x".repeat(32))
    await expect(load()).resolves.toBeDefined()
  })
})

describe("trustHost", () => {
  it("defaults to true and can be disabled with AUTH_TRUST_HOST=false", async () => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(32))
    expect((await load()).authConfig.trustHost).toBe(true)
    vi.stubEnv("AUTH_TRUST_HOST", "false")
    expect((await load()).authConfig.trustHost).toBe(false)
  })
})
