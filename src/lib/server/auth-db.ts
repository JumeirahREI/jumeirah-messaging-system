import bcrypt from "bcryptjs"
import { and, eq, isNull } from "drizzle-orm"

import type { SessionUser } from "@/auth.config"
import { db } from "@/lib/server/db"
import { users } from "@/lib/server/schema"

export async function authenticateUser(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      password: users.password,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt)))
    .limit(1)
  if (rows.length === 0) return null
  const row = rows[0]
  const valid = await bcrypt.compare(password, row.password)
  if (!valid) return null
  return {
    id: row.id,
    fullname: row.fullname,
    username: row.username,
    isAdmin: row.isAdmin,
  }
}
