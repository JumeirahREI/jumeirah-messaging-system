"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, FileSpreadsheet, Upload, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { batchCreateSchema, type BatchCreateFormData } from "@/lib/schemas"
import {
  createBatch,
  previewBatchFile,
  type SheetPreviewResult,
} from "@/lib/server/batch-service"

function todayTitle(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type SheetMapping = Record<number, string | null>

export function NewBatchForm({
  projects,
}: {
  projects: { id: number; title: string }[]
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<null | {
    kind: "error"
    message: string
  }>(null)
  const [preview, setPreview] = useState<SheetPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [mapping, setMapping] = useState<SheetMapping>({})
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

  useEffect(() => {
    if (!file || !projectId) {
      setPreview(null)
      setMapping({})
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    const fd = new FormData()
    fd.set("projectId", projectId)
    fd.set("file", file)
    previewBatchFile(fd)
      .then((res) => {
        if (cancelled) return
        setPreview(res)
        if (res.ok) setMapping(res.autoMapping)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file, projectId])

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

  function handleMappingChange(towerId: number, sheetName: string | null) {
    setMapping((prev) => ({ ...prev, [towerId]: sheetName }))
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
    const activeMapping: Record<string, string> = {}
    for (const [towerId, sheetName] of Object.entries(mapping)) {
      if (sheetName) activeMapping[towerId] = sheetName
    }
    if (Object.keys(activeMapping).length > 0) {
      formData.set("sheetMapping", JSON.stringify(activeMapping))
    }
    const res = await createBatch(formData)
    if (!res.ok) {
      if (res.error === "parse") {
        setResult({ kind: "error", message: res.message })
        toast.error(res.message)
      } else if (res.error === "invalid_project") {
        toast.error("المشروع غير صالح")
      } else {
        toast.error("لم يتم العثور على شقق في الملف")
      }
      return
    }
    const parts: string[] = []
    if (res.unmatchedCount > 0)
      parts.push(`${res.unmatchedCount} تسمية غير مطابقة`)
    if (res.missingCount > 0) parts.push(`${res.missingCount} شقة غير مضمونة`)
    if (parts.length > 0) toast.warning(`تم إنشاء الدفعة — ${parts.join("، ")}`)
    else toast.success("تم إنشاء الدفعة")
    router.push(`/batches/${res.batchId}`)
  }

  const previewData = preview?.ok ? preview : null
  const usedSheets = new Set(
    Object.entries(mapping)
      .filter(([, sheet]) => sheet !== null)
      .map(([, sheet]) => sheet!)
  )

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
                  <NativeSelect
                    id="project"
                    className="w-full"
                    value={projectId}
                    onChange={(e) =>
                      e.target.value &&
                      setValue("projectId", e.target.value, {
                        shouldValidate: true,
                      })
                    }
                    disabled={isSubmitting}
                  >
                    <NativeSelectOption value="" disabled>
                      اختر المشروع
                    </NativeSelectOption>
                    {projects.map((p) => (
                      <NativeSelectOption key={p.id} value={String(p.id)}>
                        {p.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
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
                {previewLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner />
                    جارٍ قراءة أوراق الملف...
                  </div>
                )}
                {preview && !preview.ok && (
                  <Alert variant="destructive">
                    <AlertTitle>خطأ في قراءة الملف</AlertTitle>
                    <AlertDescription>{preview.error}</AlertDescription>
                  </Alert>
                )}
                {previewData &&
                  previewData.towers.length > 0 &&
                  previewData.towers.map((tower) => {
                    const selectedSheet = mapping[tower.id] ?? null
                    return (
                      <Field key={tower.id}>
                        <FieldLabel className="flex items-center gap-1.5">
                          <Building2 className="size-4 text-muted-foreground" />
                          البرج {tower.label}
                        </FieldLabel>
                        <NativeSelect
                          className="w-full"
                          value={selectedSheet ?? ""}
                          onChange={(e) =>
                            handleMappingChange(
                              tower.id,
                              e.target.value || null
                            )
                          }
                          disabled={isSubmitting}
                        >
                          <NativeSelectOption value="">
                            بدون ورقة
                          </NativeSelectOption>
                          {previewData.sheets.map((sheetName) => {
                            const isUsed =
                              usedSheets.has(sheetName) &&
                              selectedSheet !== sheetName
                            return (
                              <NativeSelectOption
                                key={sheetName}
                                value={sheetName}
                                disabled={isUsed}
                              >
                                {sheetName}
                                {isUsed && " (مستخدمة)"}
                              </NativeSelectOption>
                            )
                          })}
                        </NativeSelect>
                      </Field>
                    )
                  })}
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

      {result?.kind === "error" && (
        <Alert variant="destructive">
          <AlertTitle>خطأ في التحليل</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
