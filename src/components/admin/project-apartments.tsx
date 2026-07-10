"use client"

import { DoorOpen, Plus } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { EmptyState } from "@/components/admin/empty-state"
import { SearchInput, useSearchFilter } from "@/components/admin/search-input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type {
  ApartmentWithTowerRow,
  TowerRow,
} from "@/lib/server/reference-data"

const PAGE_SIZE = 24

export function ProjectApartments({
  apartments,
  towers,
  projectId,
}: {
  apartments: ApartmentWithTowerRow[]
  towers: TowerRow[]
  projectId: string
}) {
  const [towerFilter, setTowerFilter] = useState<string>("all")
  const { query, setQuery, filtered } = useSearchFilter(
    apartments,
    (a, q) =>
      a.label.toLowerCase().includes(q) ||
      (a.unitNumber ?? "").toLowerCase().includes(q) ||
      a.towerLabel.toLowerCase().includes(q)
  )
  const [visible, setVisible] = useState(PAGE_SIZE)

  const towerFiltered = useMemo(
    () =>
      towerFilter === "all"
        ? filtered
        : filtered.filter((a) => String(a.towerId) === towerFilter),
    [filtered, towerFilter]
  )
  const shown = useMemo(
    () => towerFiltered.slice(0, visible),
    [towerFiltered, visible]
  )

  if (apartments.length === 0) {
    return (
      <EmptyState
        icon={DoorOpen}
        title="لا توجد شقق بعد"
        description="أضف شقة أولًا لأحد الأبراج."
      />
    )
  }

  const newHref = `/admin/projects/${projectId}/apartments/new`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="ابحث بالاسم أو رقم الوحدة أو البرج..."
            className="sm:max-w-xs"
          />
          <NativeSelect
            className="sm:w-44"
            value={towerFilter}
            onChange={(e) => {
              setTowerFilter(e.target.value || "all")
              setVisible(PAGE_SIZE)
            }}
          >
            <NativeSelectOption value="all">كل الأبراج</NativeSelectOption>
            {towers.map((t) => (
              <NativeSelectOption key={t.id} value={String(t.id)}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href={newHref} />}>
          <Plus className="size-4" />
          شقة جديدة
        </Button>
      </div>

      {towerFiltered.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="لا نتائج"
          description="جرّب كلمة بحث أخرى أو غيّر البرج."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((a) => (
              <Card
                key={a.id}
                size="sm"
                className="group/apt-card relative flex flex-col gap-2 py-4 ring-foreground/5 transition-all hover:shadow-md hover:ring-primary/30"
              >
                <Link
                  href={`/admin/projects/${projectId}/apartments/${a.id}`}
                  className="absolute inset-0 z-10 rounded-xl"
                  aria-label={`فتح ${a.label}`}
                />
                <div className="flex items-center gap-2.5 px-(--card-spacing)">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <DoorOpen className="size-6" />
                  </span>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">
                      {a.towerLabel}
                    </span>
                    <h3 className="min-w-0 truncate font-heading text-base leading-tight font-medium">
                      {a.label}
                    </h3>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {visible < towerFiltered.length && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                عرض المزيد ({towerFiltered.length - visible})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
