"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight } from "lucide-react"
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
import { projectSchema, type ProjectFormData } from "@/lib/schemas"
import { createProject } from "@/lib/server/reference-data"

export default function NewProjectPage() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
  })

  async function onSubmit(data: ProjectFormData) {
    const result = await createProject({ title: data.title })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إنشاء المشروع")
    router.push(`/admin/projects/${result.data.id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="مشروع جديد"
        actions={
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/projects" />}
          >
            <ArrowRight className="size-4" />
            رجوع
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>بيانات المشروع</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">العنوان</Label>
                <Input
                  id="title"
                  placeholder="مثال: أبراج الحظاء"
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
            <CardFooter className="gap-2 border-t pt-(--card-spacing)">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => router.push("/admin/projects")}
              >
                إلغاء
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  )
}
