"use server"

import { signIn, signOut } from "@/auth"
import { checkRateLimit, loginLimiter } from "@/lib/server/rate-limit"
import { redirect } from "next/navigation"

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
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
  redirect("/batches")
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false })
  redirect("/login")
}
