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

declare module "@auth/core/jwt" {
  interface JWT {
    id?: number
    fullname?: string
    username?: string
    isAdmin?: boolean
  }
}

export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as SessionUser
        token.id = u.id
        token.fullname = u.fullname
        token.username = u.username
        token.isAdmin = u.isAdmin
      }
      return token
    },
    session({ session, token }) {
      if (token.id !== undefined) {
        session.user = {
          id: token.id,
          fullname: token.fullname ?? "",
          username: token.username ?? "",
          isAdmin: token.isAdmin ?? false,
        }
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
