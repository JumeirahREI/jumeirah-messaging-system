"use client"

import { Building2, ChevronLeft, DoorOpen } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/admin/empty-state"
import { SearchInput, useSearchFilter } from "@/components/admin/search-input"
import { Card } from "@/components/ui/card"
import type { ProjectWithCountsRow } from "@/lib/server/reference-data"

export function ProjectsGrid({
  projects,
  isAdmin,
}: {
  projects: ProjectWithCountsRow[]
  isAdmin: boolean
}) {
  const { query, setQuery, filtered } = useSearchFilter(projects, (p, q) =>
    p.title.toLowerCase().includes(q)
  )

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="لا توجد مشاريع بعد"
        description="ابدأ بإضافة أول مشروع لإدارة أبراجه وشققه وجهات الاتصال."
        actionLabel={isAdmin ? "مشروع جديد" : undefined}
        actionHref={isAdmin ? "/admin/projects/new" : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="ابحث باسم المشروع..."
      />
      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا نتائج"
          description="جرّب كلمة بحث أخرى."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              size="sm"
              className="group/project-card relative flex flex-col gap-3 py-5 ring-foreground/5 transition-all hover:shadow-md hover:ring-primary/30"
            >
              <Link
                href={`/admin/projects/${p.id}`}
                className="absolute inset-0 z-10 rounded-xl"
                aria-label={`فتح ${p.title}`}
              />
              <div className="flex items-center gap-3 px-(--card-spacing)">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="size-5" />
                </span>
                <h3 className="min-w-0 truncate font-heading text-lg leading-tight font-medium">
                  {p.title}
                </h3>
              </div>
              <div className="mt-auto flex items-center gap-4 border-t px-(--card-spacing) pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {p.towerCount} برج
                </span>
                <span className="flex items-center gap-1.5">
                  <DoorOpen className="size-3.5" />
                  {p.apartmentCount} شقة
                </span>
              </div>
              <div className="flex items-center justify-end px-(--card-spacing) text-xs font-medium text-primary opacity-0 transition-opacity group-hover/project-card:opacity-100">
                <span className="flex items-center gap-1">
                  فتح
                  <ChevronLeft className="size-3.5" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
