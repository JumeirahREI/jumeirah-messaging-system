"use client"

import {
  Building2,
  ContactRound,
  LogOut,
  MessageSquare,
  MoonIcon,
  SunIcon,
  Users,
} from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { logoutAction } from "@/app/login/actions"
import type { SessionUser } from "@/auth.config"
import { JumeirahLogo } from "@/components/jumeirah-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
  const pathname = usePathname()
  const isActive = exact ? pathname === to : pathname.startsWith(to)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={to} />}
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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const initials = session.fullname
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
      toast.success("تم تسجيل الخروج")
      router.replace("/login")
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <SidebarMenuButton
        render={<DropdownMenuTrigger className="w-full py-7!" />}
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
          <DropdownMenuItem
            variant="destructive"
            onClick={handleLogout}
            disabled={isPending}
          >
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
    <Sidebar variant="floating" side="right" dir="rtl">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/batches" />}
              size="lg"
              className="gap-3"
            >
              <div className="mt-2 w-full translate-x-2 p-4">
                <JumeirahLogo />
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
                to="/batches"
                icon={<MessageSquare />}
                label="دفعات الرسائل"
              />
              <NavItem
                to="/admin/projects"
                icon={<Building2 />}
                label="المشاريع"
              />
              <NavItem
                to="/contacts"
                icon={<ContactRound />}
                label="جهات الاتصال"
              />
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
