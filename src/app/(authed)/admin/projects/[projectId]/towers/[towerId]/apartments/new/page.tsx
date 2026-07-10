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
import { apartmentSchema, type ApartmentFormData } from "@/lib/schemas"
import { createApartment } from "@/lib/server/reference-data"

export default function NewApartmentPage() {
  const router = useRouter()
  const params = useParams<{ projectId: string; towerId: string }>()
  const { projectId, towerId } = params
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApartmentFormData>({
    resolver: zodResolver(apartmentSchema),
  })

  async function onSubmit(data: ApartmentFormData) {
    const result = await createApartment({
      towerId: Number(towerId),
      projectId: Number(projectId),
      label: data.label,
      unitNumber: data.unitNumber?.trim() || null,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إنشاء الشقة")
    router.push(
      `/admin/projects/${projectId}/towers/${towerId}/apartments/${result.data.id}`
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>شقة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="label">الاسم</Label>
              <Input
                id="label"
                placeholder="A101"
                {...register("label")}
                disabled={isSubmitting}
              />
              {errors.label && (
                <p className="text-sm text-destructive">
                  {errors.label.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unitNumber">رقم الوحدة (اختياري)</Label>
              <Input
                id="unitNumber"
                {...register("unitNumber")}
                disabled={isSubmitting}
              />
              {errors.unitNumber && (
                <p className="text-sm text-destructive">
                  {errors.unitNumber.message}
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
              onClick={() =>
                router.push(`/admin/projects/${projectId}/towers/${towerId}`)
              }
            >
              إلغاء
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
