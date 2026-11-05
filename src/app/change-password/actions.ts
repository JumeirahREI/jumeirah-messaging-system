"use server"

import bcrypt from "bcryptjs"
import { and, eq, isNull, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

import { unstable_update } from "@/auth"
import { getCurrentUser } from "@/lib/server/auth-helpers"
import { getClientIp } from "@/lib/server/client-ip"
import { db } from "@/lib/server/db"
import { changePasswordGuard } from "@/lib/server/password-attempts"
import { hashPassword, validateNewPassword } from "@/lib/server/passwords"
import { users } from "@/lib/server/schema"
import { signSessionUpdate } from "@/lib/server/session-proof"

const now = sql`(datetime('now'))`

const MESSAGES = {
  unauthorized: "غير مصرح",
  notFound: "المستخدم غير موجود",
  currentRequired: "كلمة المرور الحالية مطلوبة",
  currentWrong: "كلمة المرور الحالية غير صحيحة",
  mismatch: "كلمتا المرور غير متطابقتين",
  locked: "محاولات كثيرة فاشلة. حاول مرة أخرى بعد 15 دقيقة",
  unavailable: "تعذر التحقق من المحاولات حالياً. حاول مرة أخرى لاحقاً",
} as const

const inputSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: MESSAGES.mismatch,
    path: ["confirmPassword"],
  })

const field = (formData: FormData, name: string) =>
  String(formData.get(name) ?? "")

export async function changePasswordAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { error: MESSAGES.unauthorized }

  const parsed = inputSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    newPassword: field(formData, "newPassword"),
    confirmPassword: field(formData, "confirmPassword"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "خطأ" }
  }
  const { currentPassword, newPassword } = parsed.data

  const [row] = await db
    .select({ password: users.password })
    .from(users)
    .where(and(eq(users.id, user.id), isNull(users.deletedAt)))
    .limit(1)
  if (!row) return { error: MESSAGES.notFound }

  const guardKey = String(user.id)
  const ip = getClientIp(await headers())
  if (!user.mustResetPassword) {
    if (!currentPassword) return { error: MESSAGES.currentRequired }
    const status = await changePasswordGuard.check(ip, guardKey)
    if (status !== "ok") return { error: MESSAGES[status] }
    if (!(await bcrypt.compare(currentPassword, row.password))) {
      await changePasswordGuard.recordFailure(ip, guardKey)
      return { error: MESSAGES.currentWrong }
    }
    await changePasswordGuard.recordSuccess(ip, guardKey)
  }

  const violation = await validateNewPassword(newPassword, {
    username: user.username,
    currentHash: row.password,
  })
  if (violation) return { error: violation }

  const [updated] = await db
    .update(users)
    .set({
      password: await hashPassword(newPassword),
      mustResetPassword: false,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedBy: user.id,
      updatedAt: now,
    })
    .where(and(eq(users.id, user.id), isNull(users.deletedAt)))
    .returning({ sessionVersion: users.sessionVersion })
  if (!updated) return { error: MESSAGES.notFound }

  await unstable_update({
    mustResetPassword: false,
    ...signSessionUpdate(user.id, updated.sessionVersion),
  })
  return { success: true }
}
