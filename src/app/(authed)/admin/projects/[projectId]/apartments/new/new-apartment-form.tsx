"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { PageHeader } from "@/components/admin/page-header"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apartmentSchema, type ApartmentFormData } from "@/lib/schemas"
import { createApartment } from "@/lib/server/reference-data"
import type { TowerRow } from "@/lib/server/reference-data"

export function NewApartmentForm({
  projectId,
  towers,
}: {
  projectId: string
  towers: TowerRow[]
}) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ApartmentFormData>({
    resolver: zodResolver(apartmentSchema),
  })
  const towerId = watch("towerId")

  async function onSubmit(data: ApartmentFormData) {
    const result = await createApartment({
      towerId: data.towerId,
      projectId: Number(projectId),
      label: data.label,
      unitNumber: data.unitNumber?.trim() || null,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إنشاء الشقة")
    router.push(`/admin/projects/${projectId}/apartments/${result.data.id}`)
  }

  const backHref = `/admin/projects/${projectId}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="شقة جديدة"
        actions={
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={backHref} />}
          >
            <ArrowRight className="size-4" />
            رجوع
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-lg">
        <Card>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>بيانات الشقة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tower">البرج</Label>
                <Select
                  value={towerId ? String(towerId) : ""}
                  onValueChange={(v) =>
                    setValue("towerId", v ? Number(v) : 0, {
                      shouldValidate: true,
                    })
                  }
                  disabled={isSubmitting || towers.length === 0}
                >
                  <SelectTrigger id="tower">
                    <SelectValue placeholder="اختر البرج...">
                      {(value: string | null) =>
                        value
                          ? towers.find((t) => String(t.id) === value)?.label ??
                            null
                          : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {towers.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.towerId && (
                  <p className="text-sm text-destructive">
                    {errors.towerId.message}
                  </p>
                )}
                {towers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    لا توجد أبراج. أضف برجًا أولًا.
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                    placeholder="101"
                    {...register("unitNumber")}
                    disabled={isSubmitting}
                  />
                  {errors.unitNumber && (
                    <p className="text-sm text-destructive">
                      {errors.unitNumber.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2 border-t pt-(--card-spacing)">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => router.push(backHref)}
              >
                إلغاء
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
