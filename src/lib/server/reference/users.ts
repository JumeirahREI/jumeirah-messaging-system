"use server"
import bcrypt from "bcryptjs"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { userCreateSchema, userUpdateSchema } from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
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

export async function createUser(input: {
  fullname: string
  username: string
  isAdmin: boolean
}): Promise<
  MutationResult<{
    id: number
    fullname: string
    username: string
    isAdmin: boolean
  }>
> {
  const user = await requireRoleRateLimited("admin")
  const parsed = userCreateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1)
  if (existing.length > 0) {
    return { ok: false, error: "اسم المستخدم مستخدم مسبقًا" } as const
  }
  return safeMutation(async () => {
    const hash = await bcrypt.hash(parsed.data.username, 12)
    const [row] = await db
      .insert(users)
      .values({
        fullname: parsed.data.fullname,
        username: parsed.data.username,
        password: hash,
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
    return { ok: true, data: row } as const
  })
}

export async function updateUser(input: {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
}): Promise<
  MutationResult<{
    id: number
    fullname: string
    username: string
    isAdmin: boolean
  }>
> {
  const user = await requireRoleRateLimited("admin")
  const parsed = userUpdateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1)
  if (existing.length > 0 && existing[0].id !== parsed.data.id) {
    return { ok: false, error: "اسم المستخدم مستخدم مسبقًا" } as const
  }
  return safeMutation(async () => {
    if (parsed.data.isAdmin === false) {
      const target = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(and(eq(users.id, parsed.data.id), isNull(users.deletedAt)))
        .limit(1)
      if (target.length > 0 && target[0].isAdmin) {
        const adminCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.isAdmin, true), isNull(users.deletedAt)))
        if ((adminCount[0]?.count ?? 0) <= 1) {
          return {
            ok: false,
            error: "لا يمكن تخفيض صلاحيات آخر مسؤول",
          } as const
        }
      }
    }
    const row = await db
      .update(users)
      .set({
        fullname: parsed.data.fullname,
        username: parsed.data.username,
        isAdmin: parsed.data.isAdmin,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(and(eq(users.id, parsed.data.id), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        fullname: users.fullname,
        username: users.username,
        isAdmin: users.isAdmin,
      })
    if (row.length === 0)
      return { ok: false, error: "المستخدم غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function resetUserPassword(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  const existing = await db
    .select({ username: users.username })
    .from(users)
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .limit(1)
  if (existing.length === 0)
    return { ok: false, error: "المستخدم غير موجود" } as const
  const hash = await bcrypt.hash(existing[0].username, 12)
  const row = await db
    .update(users)
    .set({
      password: hash,
      mustResetPassword: true,
      updatedBy: user.id,
      updatedAt: now,
    })
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .returning({ id: users.id })
  if (row.length === 0)
    return { ok: false, error: "المستخدم غير موجود" } as const
  return { ok: true, data: row[0] } as const
}

export async function softDeleteUser(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  if (input.id === user.id) {
    return { ok: false, error: "لا يمكن حذف حسابك الحالي" } as const
  }
  const target = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .limit(1)
  if (target.length > 0 && target[0].isAdmin) {
    const adminCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNull(users.deletedAt)))
    if ((adminCount[0]?.count ?? 0) <= 1) {
      return { ok: false, error: "لا يمكن حذف آخر مسؤول" } as const
    }
  }
  const result = await db
    .update(users)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(users.id, input.id), isNull(users.deletedAt)))
    .returning({ id: users.id })
  if (result.length === 0) {
    return { ok: false, error: "المستخدم غير موجود" } as const
  }
  return { ok: true, data: result[0] } as const
}
