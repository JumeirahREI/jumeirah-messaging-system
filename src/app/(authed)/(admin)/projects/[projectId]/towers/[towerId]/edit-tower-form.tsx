"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
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
import { towerSchema, type TowerFormData } from "@/lib/schemas"
import { softDeleteTower, updateTower } from "@/lib/server/reference-data"

export function EditTowerForm({
  towerId,
  initialLabel,
}: {
  towerId: number
  initialLabel: string
}) {
  const router = useRouter()
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const [deleting, setDeleting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TowerFormData>({
    resolver: zodResolver(towerSchema),
    defaultValues: { label: initialLabel },
  })

  async function onSubmit(data: TowerFormData) {
    const result = await updateTower({ id: towerId, label: data.label })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث البرج")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteTower({ id: towerId })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف البرج")
    router.push(`/admin/projects/${projectId}`)
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>تعديل البرج</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="label">الاسم</Label>
              <Input
                id="label"
                {...register("label")}
                disabled={isSubmitting}
              />
              {errors.label && (
                <p className="text-sm text-destructive">
                  {errors.label.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
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
  )
}
