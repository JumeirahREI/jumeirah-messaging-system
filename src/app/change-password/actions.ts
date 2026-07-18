"use server"

import bcrypt from "bcryptjs"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { auth, unstable_update } from "@/auth"
import { db } from "@/lib/server/db"
import { users } from "@/lib/server/schema"

const now = sql`(datetime('now'))`

const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
    confirmPassword: z
      .string()
      .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  })

export async function changePasswordAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth()
  if (!session?.user) {
    return { error: "غير مصرح" }
  }

  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  const parsed = changePasswordSchema.safeParse({
    newPassword,
    confirmPassword,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "خطأ" }
  }

  if (parsed.data.newPassword === session.user.username) {
    return { error: "لا يمكن استخدام اسم المستخدم ككلمة مرور" }
  }

  const rows = await db
    .select({ password: users.password })
    .from(users)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1)
  if (rows.length === 0) {
    return { error: "المستخدم غير موجود" }
  }

  const sameAsCurrent = await bcrypt.compare(
    parsed.data.newPassword,
    rows[0].password
  )
  if (sameAsCurrent) {
    return { error: "لا يمكن استخدام كلمة المرور الحالية" }
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12)
  await db
    .update(users)
    .set({
      password: hash,
      mustResetPassword: false,
      updatedBy: session.user.id,
      updatedAt: now,
    })
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))

  await unstable_update({ mustResetPassword: false })
  return { success: true }
}
