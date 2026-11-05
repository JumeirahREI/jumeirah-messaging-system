import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/server/auth-helpers"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/session-expired")
  if (!user.isAdmin) redirect("/batches")
  return <>{children}</>
}
