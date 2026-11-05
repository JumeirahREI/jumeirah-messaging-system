import { and, eq, isNull } from "drizzle-orm"
import { cache } from "react"

import { auth } from "@/auth"
import type { Role, SessionUser } from "@/auth.config"
import { db } from "@/lib/server/db"
import { users } from "@/lib/server/schema"

export type { Role, SessionUser }

const loadUserRow = cache(async (id: number) => {
  const [row] = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
      mustResetPassword: users.mustResetPassword,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1)
  return row ?? null
})

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  const row = await loadUserRow(session.user.id)
  if (!row || row.sessionVersion !== (session.sessionVersion ?? 0)) return null
  return {
    id: row.id,
    fullname: row.fullname,
    username: row.username,
    isAdmin: row.isAdmin,
    mustResetPassword: row.mustResetPassword,
  }
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("غير مصرح: يجب تسجيل الدخول")
  }
  if (role === "admin" && !user.isAdmin) {
    throw new Error("غير مصرح: هذه العملية تتطلب صلاحيات المسؤول")
  }
  return user
}
