import type { Role, SessionUser } from "@/auth.config"

let currentUser: SessionUser | null = null

export function operatorUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 1,
    fullname: "Test Operator",
    username: "operator",
    isAdmin: false,
    mustResetPassword: false,
    ...overrides,
  }
}

export function adminUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return operatorUser({
    id: 2,
    fullname: "Test Admin",
    username: "admin",
    isAdmin: true,
    ...overrides,
  })
}

export function setTestUser(user: SessionUser | null): void {
  currentUser = user
}

export function resetAuth(): void {
  currentUser = null
}

export function authHelpersModule() {
  return {
    getCurrentUser: async (): Promise<SessionUser | null> => currentUser,
    requireRole: async (role: Role): Promise<SessionUser> => {
      if (!currentUser) throw new Error("غير مصرح: يجب تسجيل الدخول")
      if (role === "admin" && !currentUser.isAdmin) {
        throw new Error("غير مصرح: هذه العملية تتطلب صلاحيات المسؤول")
      }
      return currentUser
    },
  }
}

export function authModule() {
  return {
    auth: async (): Promise<{ user: SessionUser } | null> =>
      currentUser ? { user: currentUser } : null,
  }
}
