import { describe, expect, it } from "vitest"

import { normalizeAllowedOrigin, resolveAllowedOrigins } from "@/lib/site-url"

describe("normalizeAllowedOrigin", () => {
  it.each([
    ["https://Example.com", "example.com"],
    ["https://example.com/", "example.com"],
    ["https://example.com/path?x=1#h", "example.com"],
    ["http://localhost:3000", "localhost:3000"],
    ["example.com", "example.com"],
    ["  EXAMPLE.com  ", "example.com"],
    ["my-site.netlify.app/some/path", "my-site.netlify.app"],
    ["example.com:8443/x", "example.com:8443"],
    ["*.example.com", "*.example.com"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeAllowedOrigin(input)).toBe(expected)
  })

  it.each([
    undefined,
    "",
    "   ",
    "http://",
    "https:///path",
    "not a host",
    "user@example.com",
    "exa mple.com",
    "-bad.com",
    "example.com:99999999",
    "<script>",
  ])("drops invalid input %j", (input) => {
    expect(normalizeAllowedOrigin(input)).toBeNull()
  })
})

describe("resolveAllowedOrigins", () => {
  it("uses the normalized site url", () => {
    expect(resolveAllowedOrigins("https://Site.example.com/")).toEqual([
      "site.example.com",
    ])
  })

  it("falls back to localhost when unset or invalid", () => {
    expect(resolveAllowedOrigins(undefined)).toEqual(["localhost:3000"])
    expect(resolveAllowedOrigins("???")).toEqual(["localhost:3000"])
  })
})
