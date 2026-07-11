import NextAuth from "next-auth"
import { NextResponse } from "next/server"

import { authConfig } from "@/auth.config"

const { auth } = NextAuth(authConfig)

const PUBLIC_ROUTES = ["/login", "/change-password"]
const AUTH_API_PREFIX = "/api/auth"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) || pathname.startsWith(AUTH_API_PREFIX)

  const hasSession = Boolean(req.auth)

  if (isPublicRoute) {
    if (hasSession && pathname === "/login") {
      if (req.auth?.user?.mustResetPassword) {
        return NextResponse.redirect(new URL("/change-password", req.nextUrl))
      }
      return NextResponse.redirect(new URL("/batches", req.nextUrl))
    }
    return NextResponse.next()
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (req.auth?.user?.mustResetPassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.nextUrl))
  }

  const isAdminRoute = pathname.startsWith("/admin")
  if (isAdminRoute && !req.auth?.user?.isAdmin) {
    return NextResponse.redirect(new URL("/batches", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)).*)",
  ],
}
