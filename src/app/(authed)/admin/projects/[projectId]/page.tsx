import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getProject,
  listTowers,
  type TowerRow,
} from "@/lib/server/reference-data"
import { EditProjectForm } from "./edit-project-form"

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const id = Number(projectId)
  if (Number.isNaN(id)) throw new Error("معرّف مشروع غير صالح")
  const [project, towers] = await Promise.all([
    getProject({ id }),
    listTowers({ projectId: id }),
  ])
  if (!project) throw new Error("المشروع غير موجود")

  return (
    <div className="flex flex-col gap-6">
      <EditProjectForm projectId={id} initialTitle={project.title} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">الأبراج</h2>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/projects/${projectId}/towers/new`} />}
          >
            برج جديد
          </Button>
        </div>
        {towers.length === 0 ? (
          <p className="text-muted-foreground">لا توجد أبراج بعد.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {towers.map((t: TowerRow) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            href={`/admin/projects/${projectId}/towers/${t.id}`}
                          />
                        }
                      >
                        تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
