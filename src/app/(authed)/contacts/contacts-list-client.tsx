"use client"

import { ArrowLeft, ArrowRight, ContactRound, Phone } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/admin/page-header"
import { SearchInput } from "@/components/admin/search-input"
import { CreateContactDialog } from "@/components/create-contact-dialog"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  ContactWithCountsRow,
  ProjectRow,
} from "@/lib/server/reference-data"
import { formatDate } from "@/lib/utils"

export function ContactsListClient({
  rows,
  page,
  totalPages,
  total,
  q,
  projectId,
  projects,
}: {
  rows: ContactWithCountsRow[]
  page: number
  totalPages: number
  total: number
  q: string
  projectId: number | null
  projects: ProjectRow[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState(q)
  const [createOpen, setCreateOpen] = useState(false)

  function updateUrl(next: {
    q?: string
    projectId?: number | null
    page?: number
  }) {
    const params = new URLSearchParams()
    const nextQ = next.q ?? q
    const nextProject = next.projectId ?? projectId
    const nextPage = next.page ?? 1
    if (nextQ) params.set("q", nextQ)
    if (nextProject !== null) params.set("project", String(nextProject))
    if (nextPage > 1) params.set("page", String(nextPage))
    const qs = params.toString()
    router.push(qs ? `/contacts?${qs}` : "/contacts")
  }

  function handleSearchChange(value: string) {
    setSearch(value)
  }

  function handleSearchSubmit() {
    updateUrl({ q: search, page: 1 })
  }

  function handleProjectChange(value: string) {
    updateUrl({
      projectId: value === "" ? null : Number(value),
      page: 1,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="جهات الاتصال"
        description="إدارة جهات الاتصال وأرقام الهاتف والربط بالشقق"
        actions={
          <CreateContactDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onMutate={() => router.refresh()}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSearchSubmit()
          }}
        >
          <SearchInput
            value={search}
            onChange={handleSearchChange}
            placeholder="ابحث بالاسم..."
          />
        </form>
        <NativeSelect
          className="w-40"
          value={projectId !== null ? String(projectId) : ""}
          onChange={(e) => handleProjectChange(e.target.value)}
        >
          <NativeSelectOption value="">كل المشاريع</NativeSelectOption>
          {projects.map((p) => (
            <NativeSelectOption key={p.id} value={String(p.id)}>
              {p.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ContactRound}
          title={q || projectId !== null ? "لا نتائج" : "لا توجد جهات اتصال"}
          description={
            q || projectId !== null
              ? "جرّب كلمة بحث أخرى أو غيّر المشروع."
              : "ابدأ بإضافة أول جهة اتصال."
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead className="tabular-nums">أرقام الهاتف</TableHead>
                <TableHead className="tabular-nums">الشقق</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/contacts/${c.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.fullname}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground" />
                      {c.phoneCount}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <ContactRound className="size-3.5 text-muted-foreground" />
                      {c.apartmentCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(c.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            صفحة {page} من {totalPages} ({total} جهة اتصال)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateUrl({ page: page - 1 })}
            >
              السابق
              <ArrowLeft data-icon="inline-start" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateUrl({ page: page + 1 })}
            >
              <ArrowRight data-icon="inline-end" />
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
