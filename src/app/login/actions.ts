"use server"

import { signIn, signOut } from "@/auth"
import { checkRateLimit, loginLimiter } from "@/lib/server/rate-limit"

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  if (!username || !password) {
    return { error: "اسم المستخدم وكلمة المرور مطلوبان" }
  }

  const allowed = await checkRateLimit(loginLimiter, `login:${username}`)
  if (!allowed) {
    return { error: "محاولات كثيرة فاشلة. حاول مرة أخرى بعد 15 دقيقة" }
  }

  try {
    await signIn("credentials", {
      username,
      password,
      redirect: false,
    })
  } catch {
    return { error: "بيانات الدخول غير صحيحة" }
  }
  return { success: true }
}

export async function logoutAction(): Promise<{ success: true }> {
  await signOut({ redirect: false })
  return { success: true }
}
