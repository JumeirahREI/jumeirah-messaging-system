import { describe, expect, it } from "vitest"

import { PUBLIC_ROUTES } from "@/lib/public-routes"

describe("PUBLIC_ROUTES", () => {
  it("contains only login and change-password", () => {
    expect([...PUBLIC_ROUTES].sort()).toEqual(["/change-password", "/login"])
    expect(PUBLIC_ROUTES).not.toContain("/debug-sentry")
  })
})
