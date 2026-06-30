import { createServerFn } from "@tanstack/react-start"
import { deleteCookie, setCookie } from "@tanstack/react-start/server"

import type { Role, SessionUser } from "./auth.server"
import {
  SESSION_COOKIE,
  authenticateUser,
  getCurrentUser,
  signSession,
} from "./auth.server"

export type { Role, SessionUser }

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    return await getCurrentUser()
  }
)

export const login = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as { username?: unknown }).username !== "string" ||
      typeof (input as { password?: unknown }).password !== "string"
    ) {
      throw new Error("اسم المستخدم وكلمة المرور مطلوبان")
    }
    return input as { username: string; password: string }
  })
  .handler(async ({ data }) => {
    const user = await authenticateUser(data.username, data.password)
    if (!user) {
      return { ok: false, error: "بيانات الدخول غير صحيحة" } as const
    }
    const token = await signSession({ userId: user.id })
    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return { ok: true, user } as const
  })

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(SESSION_COOKIE, { path: "/" })
  return { ok: true } as const
})
