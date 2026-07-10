import { Building2, Layers } from "lucide-react"

import { PageHeader } from "@/components/admin/page-header"
import { ProjectApartments } from "@/components/admin/project-apartments"
import { StatCard, StatGrid } from "@/components/admin/stat-card"
import {
  getProject,
  listApartmentsByProject,
  listTowers,
} from "@/lib/server/reference-data"
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const id = Number(projectId)
  if (Number.isNaN(id)) throw new Error("معرّف مشروع غير صالح")
  const [project, towers, apartments] = await Promise.all([
    getProject({ id }),
    listTowers({ projectId: id }),
    listApartmentsByProject({ projectId: id }),
  ])
  if (!project) throw new Error("المشروع غير موجود")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.title}
        // actions={<DeleteProjectButton projectId={id} />}
      />

      <StatGrid>
        <StatCard
          label="الأبراج"
          value={towers.length}
          icon={Building2}
          hint="إجمالي الأبراج"
        />
        <StatCard
          label="الشقق"
          value={apartments.length}
          icon={Layers}
          hint="عبر كل الأبراج"
        />
      </StatGrid>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">الشقق</h2>
        <ProjectApartments
          apartments={apartments}
          towers={towers}
          projectId={projectId}
        />
      </section>
    </div>
  )
}
