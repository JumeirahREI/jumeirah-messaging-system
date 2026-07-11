import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { db } from "../src/lib/server/db"
import { users } from "../src/lib/server/schema"

if (
  process.env.NODE_ENV === "production" &&
  process.env.SEED_ALLOW_PRODUCTION !== "1"
) {
  console.error(
    "Refusing to seed in production. Set SEED_ALLOW_PRODUCTION=1 to override."
  )
  process.exit(1)
}

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin"
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD

if (!ADMIN_PASSWORD) {
  console.error("SEED_ADMIN_PASSWORD environment variable is required.")
  process.exit(1)
}

const adminPassword: string = ADMIN_PASSWORD

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
  const password = await bcrypt.hash(adminPassword, 12)
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
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
