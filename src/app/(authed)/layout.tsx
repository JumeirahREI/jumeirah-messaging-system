import { redirect } from "next/navigation"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/server/auth-helpers"

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/session-expired")
  if (user.mustResetPassword) redirect("/change-password")

  return (
    <SidebarProvider>
      <AppSidebar session={user} />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
