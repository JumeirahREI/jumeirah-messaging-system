import { describe, expect, it } from "vitest"

import { checkSeedTarget } from "../../../scripts/dev/seed-guard.mjs"

describe("checkSeedTarget", () => {
  it("allows a local file db outside production", () => {
    expect(
      checkSeedTarget({ nodeEnv: "development", dbUrl: "file:local.db" })
    ).toBeNull()
    expect(
      checkSeedTarget({ nodeEnv: undefined, dbUrl: "file:./dev.db" })
    ).toBeNull()
  })

  it("refuses production", () => {
    expect(
      checkSeedTarget({ nodeEnv: "production", dbUrl: "file:local.db" })
    ).toMatch(/production/i)
  })

  it("refuses remote or missing urls", () => {
    for (const dbUrl of ["libsql://x.turso.io", "https://x", "", undefined]) {
      expect(checkSeedTarget({ nodeEnv: "development", dbUrl })).toMatch(
        /file:/
      )
    }
  })
})
