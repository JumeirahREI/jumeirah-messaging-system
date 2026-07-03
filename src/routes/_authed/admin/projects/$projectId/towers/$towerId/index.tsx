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
  getTower,
  listApartments,
  softDeleteTower,
  updateTower,
} from "@/lib/server/reference-data"

export const Route = createFileRoute(
  "/_authed/admin/projects/$projectId/towers/$towerId/"
)({
  loader: async ({ params }) => {
    const towerId = Number(params.towerId)
    if (Number.isNaN(towerId)) throw new Error("معرّف برج غير صالح")
    const [tower, apartments] = await Promise.all([
      getTower({ data: { id: towerId } }),
      listApartments({ data: { towerId } }),
    ])
    if (!tower) throw new Error("البرج غير موجود")
    return { towerId, projectId: params.projectId, tower, apartments }
  },
  component: EditTowerPage,
})

function EditTowerPage() {
  const navigate = useNavigate()
  const { towerId, projectId, tower, apartments } = Route.useLoaderData()
  const [label, setLabel] = useState(tower.label)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await updateTower({ data: { id: towerId, label } })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث البرج")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteTower({ data: { id: towerId } })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف البرج")
    navigate({ to: "/admin/projects/$projectId", params: { projectId } })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <form onSubmit={handleUpdate}>
            <CardHeader>
              <CardTitle>تعديل البرج</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="label">الاسم</Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
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
                    <AlertDialogTitle>حذف البرج؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم حذف البرج وجميع شققه. لا يمكن التراجع.
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
          <h2 className="text-lg font-medium">الشقق</h2>
          <Button
            size="sm"
            render={
              <Link
                to="/admin/projects/$projectId/towers/$towerId/apartments/new"
                params={{ projectId, towerId: String(towerId) }}
              />
            }
          >
            شقة جديدة
          </Button>
        </div>
        {apartments.length === 0 ? (
          <p className="text-muted-foreground">لا توجد شقق بعد.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>رقم الوحدة</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apartments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.unitNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            to="/admin/projects/$projectId/towers/$towerId/apartments/$apartmentId"
                            params={{
                              projectId,
                              towerId: String(towerId),
                              apartmentId: String(a.id),
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
