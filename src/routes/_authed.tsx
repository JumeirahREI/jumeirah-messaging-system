import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      })
    }
    return { session: context.session }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { session } = Route.useRouteContext()

  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
