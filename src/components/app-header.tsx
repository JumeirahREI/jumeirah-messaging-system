"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const ROUTE_LABELS: Record<string, string> = {
  batches: "دفعات الرسائل",
  new: "دفعة رسائل جديدة",
  admin: "الإدارة",
  projects: "المشاريع",
  towers: "الأبراج",
  apartments: "الشقق",
  users: "المستخدمون",
  warning: "تحذيرات المتابعة",
}

function labelFor(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment
}

export function AppHeader() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  const crumbs: { label: string; to: string | null }[] = []
  if (segments.length === 0) {
    crumbs.push({ label: "لوحة التحكم", to: null })
  } else {
    crumbs.push({ label: "لوحة التحكم", to: "/" })
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (/^\d+$/.test(seg)) continue
      const isLast = i === segments.length - 1
      const path = "/" + segments.slice(0, i + 1).join("/")
      crumbs.push({ label: labelFor(seg), to: isLast ? null : path })
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-6 self-center" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.to ? (
                  <BreadcrumbLink render={<Link href={crumb.to} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
