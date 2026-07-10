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
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
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
  },
  providers: [],
} satisfies NextAuthConfig
