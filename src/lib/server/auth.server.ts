import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"
import { and, eq, isNull } from "drizzle-orm"
import { getCookie } from "@tanstack/react-start/server"

import { db } from "./db"
import { users } from "./schema"

export const SESSION_COOKIE = "jumeirah_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const ALG = "HS256"

export type Role = "operator" | "admin"

export type SessionUser = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
}

type SessionPayload = {
  userId: number
}

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 32 characters"
    )
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(sessionSecret())
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: [ALG],
    })
    const userId = payload.userId
    if (typeof userId !== "number") return null
    return { userId }
  } catch {
    return null
  }
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      password: users.password,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt)))
    .limit(1)
  if (rows.length === 0) return null
  const user = rows[0]
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return null
  return {
    id: user.id,
    fullname: user.fullname,
    username: user.username,
    isAdmin: user.isAdmin,
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const payload = await verifySession(token)
  if (!payload) return null
  const rows = await db
    .select({
      id: users.id,
      fullname: users.fullname,
      username: users.username,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(and(eq(users.id, payload.userId), isNull(users.deletedAt)))
    .limit(1)
  if (rows.length === 0) return null
  return rows[0]
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
