import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { db } from "../src/lib/server/db"
import { users } from "../src/lib/server/schema"

const ADMIN_USERNAME = "admin"
const ADMIN_PASSWORD = "admin123"

async function seedAdmin() {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, ADMIN_USERNAME))
    .limit(1)
  if (existing.length > 0) {
    console.log(
      `Admin user "${ADMIN_USERNAME}" already exists (id=${existing[0].id}). Skipping.`
    )
    return
  }
  const password = await bcrypt.hash(ADMIN_PASSWORD, 12)
  const [created] = await db
    .insert(users)
    .values({
      fullname: "System Administrator",
      username: ADMIN_USERNAME,
      password,
      isAdmin: true,
    })
    .returning({ id: users.id })
  console.log(`Seeded admin user "${ADMIN_USERNAME}" (id=${created.id}).`)
  console.log(`Default password: "${ADMIN_PASSWORD}" — change on first login.`)
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
