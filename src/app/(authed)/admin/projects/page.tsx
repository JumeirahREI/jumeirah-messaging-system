import { Plus } from "lucide-react"
import Link from "next/link"

import { auth } from "@/auth"
import { PageHeader } from "@/components/admin/page-header"
import { ProjectsGrid } from "@/components/admin/projects-grid"
import { Button } from "@/components/ui/button"
import { listProjectsWithCounts } from "@/lib/server/reference-data"

export default async function ProjectsListPage() {
  const session = await auth()
  const isAdmin = session?.user?.isAdmin ?? false
  const projects = await listProjectsWithCounts()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المشاريع"
        actions={
          isAdmin ? (
            <Button
              nativeButton={false}
              render={<Link href="/admin/projects/new" />}
            >
              <Plus className="size-4" />
              مشروع جديد
            </Button>
          ) : null
        }
      />
      <ProjectsGrid projects={projects} isAdmin={isAdmin} />
    </div>
  )
}
