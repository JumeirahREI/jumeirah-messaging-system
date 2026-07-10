"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useParams, useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

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
import { createTower } from "@/lib/server/reference-data"

export default function NewTowerPage() {
  const router = useRouter()
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TowerFormData>({
    resolver: zodResolver(towerSchema),
  })

  async function onSubmit(data: TowerFormData) {
    const result = await createTower({
      projectId: Number(projectId),
      label: data.label,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إنشاء البرج")
    router.push(`/admin/projects/${projectId}/towers/${result.data.id}`)
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>برج جديد</CardTitle>
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
          <CardFooter className="gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => router.push(`/admin/projects/${projectId}`)}
            >
              إلغاء
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
