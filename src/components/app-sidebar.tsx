import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoonIcon,
  Settings,
  ShieldCheck,
  SunIcon,
  Users,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import type { SessionUser } from "@/lib/server/auth"
import { logout } from "@/lib/server/auth"

function NavItem({
  to,
  icon,
  label,
  exact,
}: {
  to: string
  icon: React.ReactNode
  label: string
  exact?: boolean
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isActive = exact ? pathname === to : pathname.startsWith(to)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={to} />}
        isActive={isActive}
        tooltip={label}
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function UserMenu({ session }: { session: SessionUser }) {
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const initials = session.fullname
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")

  async function handleLogout() {
    await logout()
    toast.success("تم تسجيل الخروج")
    navigate({ to: "/login", search: { redirect: undefined } })
  }

  return (
    <DropdownMenu>
      <SidebarMenuButton
        render={<DropdownMenuTrigger className="w-full" />}
        tooltip={session.fullname}
      >
        <Avatar className="size-7">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {session.fullname}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {session.isAdmin ? "مسؤول" : "مشغّل"}
          </span>
        </span>
      </SidebarMenuButton>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="flex flex-col">
              <span className="text-sm font-medium">{session.fullname}</span>
              <span className="text-xs text-muted-foreground">
                {session.isAdmin ? "مسؤول" : "مشغّل"}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? (
              <SunIcon data-icon="inline-start" />
            ) : (
              <MoonIcon data-icon="inline-start" />
            )}
            {isDark ? "الوضع الفاتح" : "الوضع الداكن"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut data-icon="inline-start" />
            تسجيل الخروج
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({ session }: { session: SessionUser }) {
  return (
    <Sidebar side="right">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/" search={{ error: undefined }} />}
              size="lg"
              className="gap-3"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-heading text-base font-semibold">
                  جُميرا
                </span>
                <span className="text-xs text-muted-foreground">
                  نظام المراسلات
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>عام</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem
                to="/"
                icon={<LayoutDashboard />}
                label="لوحة التحكم"
                exact
              />
              <NavItem to="/batches" icon={<MessageSquare />} label="الدفعات" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {session.isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>الإدارة</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItem
                    to="/admin"
                    icon={<Settings />}
                    label="لوحة الإدارة"
                  />
                  <NavItem
                    to="/admin/projects"
                    icon={<ShieldCheck />}
                    label="المشاريع والبيانات"
                  />
                  <NavItem
                    to="/admin/users"
                    icon={<Users />}
                    label="المستخدمون"
                  />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu session={session} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
