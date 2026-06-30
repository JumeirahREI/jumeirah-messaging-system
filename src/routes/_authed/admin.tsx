import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: async ({ context }) => {
    if (!context.session.isAdmin) {
      throw redirect({
        to: "/",
        search: { error: "admin-only" },
      })
    }
    return { session: context.session }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return <Outlet />
}
