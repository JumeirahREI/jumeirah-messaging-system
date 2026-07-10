"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FileSpreadsheet, Upload, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { batchCreateSchema, type BatchCreateFormData } from "@/lib/schemas"
import { createBatch } from "@/lib/server/batch-service"

function todayTitle(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function NewBatchForm({
  projects,
}: {
  projects: { id: number; title: string }[]
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<
    | null
    | { kind: "unmatched"; labels: string[] }
    | { kind: "error"; message: string }
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BatchCreateFormData>({
    resolver: zodResolver(batchCreateSchema),
    defaultValues: {
      title: todayTitle(),
      projectId: "",
    },
  })

  const projectId = watch("projectId")

  function handleFileSelect(selected: File | null) {
    if (selected && !selected.name.endsWith(".xlsx")) {
      toast.error("الملف يجب أن يكون بصيغة .xlsx")
      return
    }
    setFile(selected)
    setResult(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files.item(0)
    if (dropped) handleFileSelect(dropped)
  }

  async function onSubmit(data: BatchCreateFormData) {
    if (projects.length === 0) {
      toast.error("لا توجد مشاريع. أنشئ مشروعًا أولًا.")
      return
    }
    if (!file) {
      toast.error("اختر ملف Excel")
      return
    }
    setResult(null)
    const formData = new FormData()
    formData.set("title", data.title)
    formData.set("projectId", data.projectId)
    formData.set("file", file)
    const res = await createBatch(formData)
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
    router.push(`/batches/${res.batchId}`)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="دفعة جديدة"
        description="ارفع ملف الفواتير لإنشاء دفعة إرسال"
      />

      {projects.length === 0 ? (
        <Alert>
          <AlertTitle>لا توجد مشاريع</AlertTitle>
          <AlertDescription>
            اطلب من المسؤول إنشاء مشروع أولًا قبل إنشاء دفعات.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>بيانات الدفعة</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="title">العنوان</FieldLabel>
                  <Input
                    id="title"
                    disabled={isSubmitting}
                    {...register("title")}
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive">
                      {errors.title.message}
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="project">المشروع</FieldLabel>
                  <Select
                    value={projectId}
                    onValueChange={(v) =>
                      v && setValue("projectId", v, { shouldValidate: true })
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="project">
                      <SelectValue placeholder="اختر مشروعًا">
                        {(value: string | null) =>
                          value
                            ? (projects.find((p) => String(p.id) === value)
                                ?.title ?? null)
                            : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.projectId && (
                    <p className="text-sm text-destructive">
                      {errors.projectId.message}
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="file">ملف Excel (.xlsx)</FieldLabel>
                  <input
                    ref={fileInputRef}
                    id="file"
                    type="file"
                    accept=".xlsx"
                    required
                    disabled={isSubmitting}
                    onChange={(e) =>
                      handleFileSelect(e.target.files?.[0] ?? null)
                    }
                    className="sr-only"
                  />
                  {file ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                      <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setFile(null)}
                        disabled={isSubmitting}
                        aria-label="إزالة الملف"
                      >
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragOver(true)
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      disabled={isSubmitting}
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:opacity-50 data-[drag=true]:border-primary data-[drag=true]:bg-primary/5"
                      data-drag={dragOver}
                    >
                      <Upload className="size-6" />
                      <span className="text-sm font-medium">
                        اسحب الملف هنا أو اضغط للاختيار
                      </span>
                      <span className="text-xs">xlsx. فقط</span>
                    </button>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء ومعاينة"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}

      {result?.kind === "unmatched" && (
        <Alert variant="destructive">
          <AlertTitle>تسميات غير مطابقة</AlertTitle>
          <AlertDescription>
            <p>الشقق التالية غير موجودة في المشروع المحدد:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.labels.map((l) => (
                <span
                  key={l}
                  className="rounded bg-destructive/15 px-2 py-0.5 text-xs font-medium"
                >
                  {l}
                </span>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result?.kind === "error" && (
        <Alert variant="destructive">
          <AlertTitle>خطأ في التحليل</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
