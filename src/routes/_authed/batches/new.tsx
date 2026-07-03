import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createBatch, listProjectsForBatch } from "@/lib/server/batch-service"

export const Route = createFileRoute("/_authed/batches/new")({
  loader: async () => await listProjectsForBatch(),
  component: NewBatchPage,
})

function todayTitle(): string {
  return new Date().toISOString().slice(0, 10)
}

function NewBatchPage() {
  const navigate = useNavigate()
  const projects = Route.useLoaderData()
  const [title, setTitle] = useState(todayTitle())
  const [projectId, setProjectId] = useState<string>("")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | null
    | { kind: "unmatched"; labels: string[] }
    | { kind: "error"; message: string }
  >(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (projects.length === 0) {
      toast.error("لا توجد مشاريع. أنشئ مشروعًا أولًا.")
      return
    }
    if (!projectId) {
      toast.error("اختر مشروعًا")
      return
    }
    if (!file) {
      toast.error("اختر ملف Excel")
      return
    }
    setSubmitting(true)
    setResult(null)
    const formData = new FormData()
    formData.set("title", title)
    formData.set("projectId", projectId)
    formData.set("file", file)
    const res = await createBatch({ data: formData })
    setSubmitting(false)
    if (!res.ok) {
      if (res.error === "unmatched") {
        setResult({ kind: "unmatched", labels: res.unmatched })
        toast.error("توجد تسميات شقق غير مطابقة")
      } else if (res.error === "parse") {
        setResult({ kind: "error", message: res.message })
        toast.error(res.message)
      } else if (res.error === "invalid_project") {
        toast.error("المشروع غير صالح")
      } else {
        toast.error("لم يتم العثور على شقق في الملف")
      }
      return
    }
    toast.success("تم إنشاء الدفعة")
    navigate({
      to: "/batches/$batchId",
      params: { batchId: String(res.batchId) },
    })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>دفعة جديدة</CardTitle>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="project">المشروع</Label>
              <Select
                value={projectId}
                onValueChange={(v) => v && setProjectId(v)}
                disabled={submitting || projects.length === 0}
              >
                <SelectTrigger id="project">
                  <SelectValue placeholder="اختر مشروعًا" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="file">ملف Excel (.xlsx)</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx"
                required
                disabled={submitting}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "جارٍ الإنشاء..." : "إنشاء ومعاينة"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {result?.kind === "unmatched" && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <h3 className="font-medium text-destructive">تسميات غير مطابقة</h3>
          <p className="text-sm text-muted-foreground">
            الشقق التالية غير موجودة في المشروع المحدد:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.labels.map((l) => (
              <span
                key={l}
                className="rounded bg-destructive/20 px-2 py-0.5 text-sm"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {result?.kind === "error" && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <h3 className="font-medium text-destructive">خطأ في التحليل</h3>
          <p className="text-sm">{result.message}</p>
        </div>
      )}

      {projects.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          لا توجد مشاريع. اطلب من المسؤول إنشاء مشروع أولًا.
        </p>
      )}
    </div>
  )
}
