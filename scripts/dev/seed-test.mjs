import { createClient } from "@libsql/client"
import bcrypt from "bcryptjs"

import { checkSeedTarget } from "./seed-guard.mjs"

const dbUrl = process.env.TURSO_DATABASE_URL ?? "file:local.db"
const refusal = checkSeedTarget({ nodeEnv: process.env.NODE_ENV, dbUrl })
if (refusal) {
  console.error(refusal)
  process.exit(1)
}

const client = createClient({ url: dbUrl })

// Reset: delete all users, re-seed with mustResetPassword=true
await client.execute("DELETE FROM users")

const username = "testuser"
const hash = await bcrypt.hash(username, 12)

await client.execute({
  sql: `INSERT INTO users (fullname, username, password, is_admin, must_reset_password)
        VALUES (?, ?, ?, 0, 1)`,
  args: ["Test User", username, hash],
})

const r = await client.execute(
  "SELECT id, username, must_reset_password FROM users"
)
console.log("RE-SEEDED:", JSON.stringify(r.rows[0]))
await client.close()
