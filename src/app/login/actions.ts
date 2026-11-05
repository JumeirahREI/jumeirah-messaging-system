"use server"

import { AuthError } from "next-auth"
import { headers } from "next/headers"

import { signIn, signOut } from "@/auth"
import { getClientIp } from "@/lib/server/client-ip"
import { loginGuard } from "@/lib/server/login-attempts"

const MESSAGES = {
  required: "اسم المستخدم وكلمة المرور مطلوبان",
  locked: "محاولات كثيرة فاشلة. حاول مرة أخرى بعد 15 دقيقة",
  unavailable: "تعذر التحقق من محاولات الدخول حالياً. حاول مرة أخرى لاحقاً",
  invalid: "بيانات الدخول غير صحيحة",
  server: "حدث خطأ في الخادم. حاول مرة أخرى لاحقاً",
} as const

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  if (!username.trim() || !password) return { error: MESSAGES.required }

  const ip = getClientIp(await headers())
  const status = await loginGuard.check(ip, username)
  if (status !== "ok") return { error: MESSAGES[status] }

  try {
    await signIn("credentials", { username, password, redirect: false })
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      await loginGuard.recordFailure(ip, username)
      return { error: MESSAGES.invalid }
    }
    console.error("login failed unexpectedly", error)
    return { error: MESSAGES.server }
  }
  await loginGuard.recordSuccess(ip, username)
  return { success: true }
}

export async function logoutAction(): Promise<{ success: true }> {
  await signOut({ redirect: false })
  return { success: true }
}
