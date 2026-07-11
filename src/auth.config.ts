import type { NextAuthConfig } from "next-auth"

export type Role = "operator" | "admin"

export type SessionUser = {
  id: number
  fullname: string
  username: string
  isAdmin: boolean
}

declare module "next-auth" {
  interface Session {
    user: SessionUser
  }
}

type AugmentedJWT = {
  id?: number
  fullname?: string
  username?: string
  isAdmin?: boolean
}

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 2 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      const t = token as unknown as AugmentedJWT
      if (user) {
        const u = user as unknown as SessionUser
        t.id = u.id
        t.fullname = u.fullname
        t.username = u.username
        t.isAdmin = u.isAdmin
      }
      return token
    },
    session({ session, token }) {
      const t = token as unknown as AugmentedJWT
      if (t.id !== undefined) {
        ;(session as unknown as { user: SessionUser }).user = {
          id: t.id,
          fullname: t.fullname ?? "",
          username: t.username ?? "",
          isAdmin: t.isAdmin ?? false,
        }
      }
      return session
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return new URL(url, baseUrl).toString()
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },
  providers: [],
} satisfies NextAuthConfig

if (
  !process.env.AUTH_SECRET &&
  process.env.NODE_ENV === "production" &&
  !process.env.NETLIFY
) {
  throw new Error("AUTH_SECRET environment variable is required in production")
}
