"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
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
import { projectSchema, type ProjectFormData } from "@/lib/schemas"
import { softDeleteProject, updateProject } from "@/lib/server/reference-data"

export function EditProjectForm({
  projectId,
  initialTitle,
}: {
  projectId: number
  initialTitle: string
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { title: initialTitle },
  })

  async function onSubmit(data: ProjectFormData) {
    const result = await updateProject({ id: projectId, title: data.title })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث المشروع")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteProject({ id: projectId })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف المشروع")
    router.push("/admin/projects")
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>تعديل المشروع</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">العنوان</Label>
              <Input
                id="title"
                {...register("title")}
                disabled={isSubmitting}
              />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
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
  )
}
