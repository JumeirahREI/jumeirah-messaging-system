import { createClient } from "@libsql/client"
import { describe, expect, it } from "vitest"
import { formatSqliteUtc, LOCK_TIMEOUT_SECONDS } from "./lock-time"

describe("formatSqliteUtc", () => {
  it("formats as YYYY-MM-DD HH:MM:SS in UTC", () => {
    expect(formatSqliteUtc(new Date("2026-03-04T05:06:07.890Z"))).toBe(
      "2026-03-04 05:06:07"
    )
  })

  it("has the same shape as SQLite datetime('now') and is within a second of it", async () => {
    const client = createClient({ url: ":memory:" })
    const before = formatSqliteUtc(new Date())
    const result = await client.execute("select datetime('now') as n")
    const after = formatSqliteUtc(new Date(Date.now() + 1000))
    const sqliteNow = String(result.rows[0].n)
    client.close()
    expect(sqliteNow).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(before <= sqliteNow && sqliteNow <= after).toBe(true)
  })

  it("orders consistently with SQLite datetime() output", async () => {
    const client = createClient({ url: ":memory:" })
    const cutoff = formatSqliteUtc(
      new Date(Date.now() - LOCK_TIMEOUT_SECONDS * 1000)
    )
    const result = await client.execute({
      sql: `select
        datetime('now', '-10 minutes') < ? as old_is_expired,
        datetime('now', '-1 minutes') < ? as fresh_is_expired`,
      args: [cutoff, cutoff],
    })
    client.close()
    expect(Number(result.rows[0].old_is_expired)).toBe(1)
    expect(Number(result.rows[0].fresh_is_expired)).toBe(0)
  })
})
