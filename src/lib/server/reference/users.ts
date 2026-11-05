"use server"
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm"
import { userCreateSchema, userUpdateSchema } from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { normalizeUsername } from "@/lib/server/login-attempts"
import {
  generateTemporaryPassword,
  hashPassword,
} from "@/lib/server/passwords"
import { users } from "@/lib/server/schema"
import { actor, now, safeMutation, type MutationResult } from "./shared"

export type UserRow = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
  mustResetPassword: boolean
  createdAt: string | null
}

export async function listUsers(): Promise<UserRow[]> {
  await requireRole("admin")
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
      mustResetPassword: users.mustResetPassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
  return rows satisfies UserRow[]
}

export async function getUser(input: { id: number }): Promise<{
  id: number
  fullname: string
  username: string
  isAdmin: boolean
  mustResetPassword: boolean
} | null> {
  await requireRole("admin")
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
      mustResetPassword: users.mustResetPassword,
    })
    .from(users)
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

const USERNAME_TAKEN = "اسم المستخدم مستخدم مسبقًا"
const USER_NOT_FOUND = "المستخدم غير موجود"

const keepsAnAdmin = sql`(${users.isAdmin} = 0 OR (SELECT count(*) FROM users WHERE is_admin = 1 AND deleted_at IS NULL) > 1)`
const bumpSessionVersion = sql`${users.sessionVersion} + 1`

async function isUsernameTaken(username: string, exceptId?: number) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
  return rows.some((row) => row.id !== exceptId)
}

async function explainRejectedUpdate(id: number, lastAdminError: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1)
  return {
    ok: false,
    error: rows.length > 0 ? lastAdminError : USER_NOT_FOUND,
  } as const
}

type UserSummary = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
}

export async function createUser(input: {
  fullname: string
  username: string
  isAdmin: boolean
}): Promise<MutationResult<UserSummary & { temporaryPassword: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = userCreateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  const username = normalizeUsername(parsed.data.username)
  if (!username) return { ok: false, error: "اسم المستخدم مطلوب" } as const
  if (await isUsernameTaken(username)) {
    return { ok: false, error: USERNAME_TAKEN } as const
  }
  return safeMutation(async () => {
    const temporaryPassword = generateTemporaryPassword()
    const [row] = await db
      .insert(users)
      .values({
        fullname: parsed.data.fullname,
        username,
        password: await hashPassword(temporaryPassword),
        isAdmin: parsed.data.isAdmin,
        mustResetPassword: true,
        ...actor(user),
      })
      .returning({
        id: users.id,
        fullname: users.fullname,
        username: users.username,
        isAdmin: users.isAdmin,
      })
    return { ok: true, data: { ...row, temporaryPassword } } as const
  })
}

export async function updateUser(input: {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
}): Promise<MutationResult<UserSummary>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = userUpdateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  const username = normalizeUsername(parsed.data.username)
  if (!username) return { ok: false, error: "اسم المستخدم مطلوب" } as const
  if (await isUsernameTaken(username, parsed.data.id)) {
    return { ok: false, error: USERNAME_TAKEN } as const
  }
  return safeMutation(async () => {
    const { id, isAdmin } = parsed.data
    const guards: SQL[] = [eq(users.id, id), isNull(users.deletedAt)]
    if (!isAdmin) guards.push(keepsAnAdmin)
    const row = await db
      .update(users)
      .set({
        fullname: parsed.data.fullname,
        username,
        isAdmin,
        sessionVersion: sql`CASE WHEN ${users.isAdmin} = ${isAdmin ? 1 : 0} THEN ${users.sessionVersion} ELSE ${bumpSessionVersion} END`,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(and(...guards))
      .returning({
        id: users.id,
        fullname: users.fullname,
        username: users.username,
        isAdmin: users.isAdmin,
      })
    if (row.length === 0)
      return explainRejectedUpdate(id, "لا يمكن تخفيض صلاحيات آخر مسؤول")
    return { ok: true, data: row[0] } as const
  })
}

export async function resetUserPassword(input: {
  id: number
}): Promise<MutationResult<{ id: number; temporaryPassword: string }>> {
  const user = await requireRoleRateLimited("admin")
  const temporaryPassword = generateTemporaryPassword()
  const row = await db
    .update(users)
    .set({
      password: await hashPassword(temporaryPassword),
      mustResetPassword: true,
      sessionVersion: bumpSessionVersion,
      updatedBy: user.id,
      updatedAt: now,
    })
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .returning({ id: users.id })
  if (row.length === 0) return { ok: false, error: USER_NOT_FOUND } as const
  return { ok: true, data: { id: row[0].id, temporaryPassword } } as const
}

export async function softDeleteUser(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  if (input.id === user.id) {
    return { ok: false, error: "لا يمكن حذف حسابك الحالي" } as const
  }
  const result = await db
    .update(users)
    .set({
      deletedBy: user.id,
      deletedAt: now,
      sessionVersion: bumpSessionVersion,
    })
    .where(and(eq(users.id, input.id), isNull(users.deletedAt), keepsAnAdmin))
    .returning({ id: users.id })
  if (result.length === 0)
    return explainRejectedUpdate(input.id, "لا يمكن حذف آخر مسؤول")
  return { ok: true, data: result[0] } as const
}
