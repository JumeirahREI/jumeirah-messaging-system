import type { NextAuthConfig } from "next-auth"

import { readSessionUpdate } from "@/lib/server/session-proof"

export type Role = "operator" | "admin"

export type SessionUser = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
  mustResetPassword: boolean
}

declare module "next-auth" {
  interface User {
    fullname?: string
    username?: string
    isAdmin?: boolean
    mustResetPassword?: boolean
    sessionVersion?: number
  }
  interface Session {
    user: SessionUser
    mustResetPassword: boolean
    sessionVersion: number
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: number
    fullname?: string
    username?: string
    isAdmin?: boolean
    mustResetPassword?: boolean
    sessionVersion?: number
  }
}

function readMustResetPassword(session: unknown): boolean | undefined {
  if (typeof session !== "object" || session === null) return undefined
  const value = (session as { mustResetPassword?: unknown }).mustResetPassword
  return typeof value === "boolean" ? value : undefined
}

export const authConfig = {
  trustHost: !["false", "0"].includes(process.env.AUTH_TRUST_HOST ?? ""),
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 2 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = Number(user.id)
        token.fullname = user.fullname
        token.username = user.username
        token.isAdmin = user.isAdmin
        token.mustResetPassword = user.mustResetPassword
        token.sessionVersion = user.sessionVersion
      }
      if (trigger === "update") {
        const mustResetPassword = readMustResetPassword(session)
        if (mustResetPassword !== undefined) {
          token.mustResetPassword = mustResetPassword
        }
        if (token.id !== undefined) {
          const sessionVersion = readSessionUpdate(token.id, session)
          if (sessionVersion !== null) token.sessionVersion = sessionVersion
        }
      }
      return token
    },
    session({ session, token }) {
      if (token.id === undefined) return session
      return {
        ...session,
        user: {
          id: token.id,
          fullname: token.fullname ?? "",
          username: token.username ?? "",
          isAdmin: token.isAdmin ?? false,
          mustResetPassword: token.mustResetPassword ?? false,
        },
        mustResetPassword: token.mustResetPassword ?? false,
        sessionVersion: token.sessionVersion ?? 0,
      }
    },
    redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl)
        return target.origin === new URL(baseUrl).origin
          ? target.toString()
          : baseUrl
      } catch {
        return baseUrl
      }
    },
  },
  providers: [],
} satisfies NextAuthConfig

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET environment variable is required in production")
}
