import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { authConfig } from "@/auth.config"
import { authenticateUser } from "@/lib/server/auth-db"

export { authenticateUser }

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "اسم المستخدم" },
        password: { label: "كلمة المرور", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username
        const password = credentials?.password
        if (typeof username !== "string" || typeof password !== "string") {
          return null
        }
        const user = await authenticateUser(username, password)
        if (!user) return null
        return user as unknown as { id: string; name: string; email: string }
      },
    }),
  ],
})
