import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { LayoutDashboard, LogOut, MessageSquare, Settings } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { logout } from "@/lib/server/auth"

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
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    toast.success("تم تسجيل الخروج")
    navigate({ to: "/login", search: { redirect: undefined } })
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <span className="font-medium">جُميرا</span>
          <nav className="ms-2 flex items-center gap-1">
            <NavLink to="/" icon={<LayoutDashboard className="size-4" />}>
              لوحة التحكم
            </NavLink>
            <NavLink to="/batches" icon={<MessageSquare className="size-4" />}>
              الدفعات
            </NavLink>
            {session.isAdmin && (
              <NavLink to="/admin" icon={<Settings className="size-4" />}>
                الإدارة
              </NavLink>
            )}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {session.fullname}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label="تسجيل الخروج"
            >
              <LogOut className="size-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      activeProps={{
        className: "bg-accent text-accent-foreground",
      }}
      activeOptions={{ exact: to === "/" }}
    >
      {icon}
      {children}
    </Link>
  )
}
