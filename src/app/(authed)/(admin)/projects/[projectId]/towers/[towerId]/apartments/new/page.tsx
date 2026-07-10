"use client"
import { useRouter, useParams } from "next/navigation"
import { useState } from "react"
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
import { createApartment } from "@/lib/server/reference-data"

export default function NewApartmentPage() {
  const router = useRouter()
  const params = useParams<{ projectId: string; towerId: string }>()
  const { projectId, towerId } = params
  const [label, setLabel] = useState("")
  const [unitNumber, setUnitNumber] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await createApartment({
      towerId: Number(towerId),
      projectId: Number(projectId),
      label,
      unitNumber: unitNumber.trim() || null,
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إنشاء الشقة")
    router.push(
      `/admin/projects/${projectId}/towers/${towerId}/apartments/${result.data.id}`,
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>شقة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="label">الاسم</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="A101"
                required
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unitNumber">رقم الوحدة (اختياري)</Label>
              <Input
                id="unitNumber"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                disabled={submitting}
              />
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
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
