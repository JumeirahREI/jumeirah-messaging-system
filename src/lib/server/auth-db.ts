import bcrypt from "bcryptjs"
import { and, isNull, sql } from "drizzle-orm"

import type { SessionUser } from "@/auth.config"
import { db } from "@/lib/server/db"
import { normalizeUsername } from "@/lib/server/login-attempts"
import { users } from "@/lib/server/schema"

export type AuthenticatedUser = SessionUser & { sessionVersion: number }

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-parity", 12)

export async function authenticateUser(
  username: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      password: users.password,
      isAdmin: users.isAdmin,
      mustResetPassword: users.mustResetPassword,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(
      and(
        sql`lower(${users.username}) = ${normalizeUsername(username)}`,
        isNull(users.deletedAt)
      )
    )
    .limit(1)
  const row = rows[0]
  const valid = await bcrypt.compare(password, row?.password ?? DUMMY_HASH)
  if (!row || !valid) return null
  return {
    id: row.id,
    fullname: row.fullname,
    username: row.username,
    isAdmin: row.isAdmin,
    mustResetPassword: row.mustResetPassword,
    sessionVersion: row.sessionVersion,
  }
}
