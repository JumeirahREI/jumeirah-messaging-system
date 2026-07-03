import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  softDeleteProject,
  updateProject,
} from "@/lib/server/reference-data"

export const Route = createFileRoute("/_authed/admin/projects/$projectId/")({
  loader: async ({ params }) => {
    const projectId = Number(params.projectId)
    if (Number.isNaN(projectId)) throw new Error("معرّف مشروع غير صالح")
    const [project, towers] = await Promise.all([
      getProject({ data: { id: projectId } }),
      listTowers({ data: { projectId } }),
    ])
    if (!project) throw new Error("المشروع غير موجود")
    return { projectId, project, towers }
  },
  component: EditProjectPage,
})

function EditProjectPage() {
  const navigate = useNavigate()
  const { projectId, project, towers } = Route.useLoaderData()
  const [title, setTitle] = useState(project.title)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await updateProject({ data: { id: projectId, title } })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث المشروع")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteProject({ data: { id: projectId } })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف المشروع")
    navigate({ to: "/admin/projects" })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <form onSubmit={handleUpdate}>
            <CardHeader>
              <CardTitle>تعديل المشروع</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">العنوان</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button type="submit" disabled={submitting}>
                {submitting ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleting}
                    >
                      حذف
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف المشروع؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم حذف المشروع وجميع أبراجه وشقه. لا يمكن التراجع.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      حذف
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </form>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">الأبراج</h2>
          <Button
            size="sm"
            render={
              <Link
                to="/admin/projects/$projectId/towers/new"
                params={{ projectId: String(projectId) }}
              />
            }
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
                {towers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            to="/admin/projects/$projectId/towers/$towerId"
                            params={{
                              projectId: String(projectId),
                              towerId: String(t.id),
                            }}
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
