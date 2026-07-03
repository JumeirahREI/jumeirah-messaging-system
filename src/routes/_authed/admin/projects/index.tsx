import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listProjects } from "@/lib/server/reference-data"
import { formatArabicDate } from "@/lib/utils"

export const Route = createFileRoute("/_authed/admin/projects/")({
  loader: async () => await listProjects(),
  component: ProjectsListPage,
})

function ProjectsListPage() {
  const projects = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">المشاريع</h1>
        <Button render={<Link to="/admin/projects/new" />}>
          <Plus className="size-4" />
          مشروع جديد
        </Button>
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">لا توجد مشاريع بعد.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العنوان</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatArabicDate(p.createdAt)}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      render={
                        <Link
                          to="/admin/projects/$projectId"
                          params={{ projectId: String(p.id) }}
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
  )
}
