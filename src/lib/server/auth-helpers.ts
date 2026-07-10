import { auth } from "@/auth"
import type { Role, SessionUser } from "@/auth.config"

export type { Role, SessionUser }

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user
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
