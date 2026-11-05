import { describe, expect, it } from "vitest"

import { getClientIp } from "@/lib/server/client-ip"

const h = (init: Record<string, string>) => new Headers(init)

describe("getClientIp", () => {
  it("prefers the Netlify client connection ip", () => {
    expect(
      getClientIp(
        h({
          "x-nf-client-connection-ip": "1.1.1.1",
          "x-forwarded-for": "2.2.2.2",
          "x-real-ip": "3.3.3.3",
        })
      )
    ).toBe("1.1.1.1")
  })

  it("uses the first x-forwarded-for entry", () => {
    expect(
      getClientIp(
        h({ "x-forwarded-for": " 2.2.2.2 , 9.9.9.9", "x-real-ip": "3.3.3.3" })
      )
    ).toBe("2.2.2.2")
  })

  it("falls back to x-real-ip then unknown", () => {
    expect(getClientIp(h({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3")
    expect(getClientIp(h({}))).toBe("unknown")
  })

  it("lowercases and trims", () => {
    expect(getClientIp(h({ "x-real-ip": " ABCD::1 " }))).toBe("abcd::1")
  })
})
