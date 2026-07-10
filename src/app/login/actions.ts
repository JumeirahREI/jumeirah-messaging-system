"use server"

import { redirect } from "next/navigation"
import { signIn, signOut } from "@/auth"

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  if (!username || !password) {
    return { error: "اسم المستخدم وكلمة المرور مطلوبان" }
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
  redirect("/")
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false })
  redirect("/login")
}
