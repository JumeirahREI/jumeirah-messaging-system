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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { batchCreateSchema, type BatchCreateFormData } from "@/lib/schemas"
import {
  createBatch,
  previewBatchFile,
  type BatchFormat,
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
  const [mode, setMode] = useState<"automatic" | "manual">("automatic")
  const [format, setFormat] = useState<BatchFormat>("balance")
  const [file, setFile] = useState<File | null>(null)
  const [balanceFiles, setBalanceFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<null | {
    kind: "error"
    message: string
  }>(null)
  const [preview, setPreview] = useState<SheetPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [mapping, setMapping] = useState<SheetMapping>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const balanceInputRef = useRef<HTMLInputElement>(null)

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
      mode: "automatic",
      format: "balance",
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

  function handleBalanceFilesSelected(selected: FileList | null) {
    if (!selected || selected.length === 0) return
    const valid: File[] = []
    for (const f of Array.from(selected)) {
      if (!f.name.endsWith(".xlsx")) {
        toast.error(`الملف ${f.name} ليس بصيغة .xlsx`)
        continue
      }
      valid.push(f)
    }
    if (valid.length === 0) return
    setBalanceFiles((prev) => [...prev, ...valid])
    setResult(null)
  }

  function removeBalanceFile(idx: number) {
    setBalanceFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (format === "balance") {
      handleBalanceFilesSelected(e.dataTransfer.files)
      return
    }
    const dropped = e.dataTransfer.files.item(0)
    if (dropped) handleFileSelect(dropped)
  }

  function handleMappingChange(towerId: number, sheetName: string | null) {
    setMapping((prev) => ({ ...prev, [towerId]: sheetName }))
  }

  function handleCreateResult(
    res: Awaited<ReturnType<typeof createBatch>>,
    isManual: boolean
  ) {
    if (!res.ok) {
      if (res.error === "parse") {
        setResult({ kind: "error", message: res.message })
        toast.error(res.message)
      } else if (res.error === "invalid_project") {
        toast.error("المشروع غير صالح")
      } else if (res.error === "empty_project") {
        toast.error("لا توجد شقق في هذا المشروع")
      } else {
        toast.error("لم يتم العثور على شقق في الملف")
      }
      return false
    }
    const parts: string[] = []
    if (res.unmatchedCount > 0)
      parts.push(`${res.unmatchedCount} تسمية غير مطابقة`)
    if (res.missingCount > 0) parts.push(`${res.missingCount} شقة غير مضمونة`)
    if (res.skippedCreditCount > 0)
      parts.push(`${res.skippedCreditCount} صف دائن متجاهل`)
    if (res.skippedTinyCount > 0)
      parts.push(`${res.skippedTinyCount} صف برصيد ضئيل متجاهل`)
    if (res.duplicateCount > 0) parts.push(`${res.duplicateCount} تسمية مكررة`)
    if (parts.length > 0) toast.warning(`تم إنشاء الدفعة — ${parts.join("، ")}`)
    else if (isManual) toast.success("تم إنشاء الدفعة اليدوية")
    else toast.success("تم إنشاء الدفعة")
    router.push(`/batches/${res.batchId}`)
    return true
  }

  async function onSubmit(data: BatchCreateFormData) {
    if (projects.length === 0) {
      toast.error("لا توجد مشاريع. أنشئ مشروعًا أولًا.")
      return
    }
    setResult(null)
    const formData = new FormData()
    formData.set("title", data.title)
    formData.set("projectId", data.projectId)
    formData.set("mode", mode)
    if (mode === "manual") {
      const res = await createBatch(formData)
      handleCreateResult(res, true)
      return
    }
    formData.set("format", format)
    if (format === "invoice") {
      if (!file) {
        toast.error("اختر ملف Excel")
        return
      }
      formData.set("file", file)
      const activeMapping: Record<string, string> = {}
      for (const [towerId, sheetName] of Object.entries(mapping)) {
        if (sheetName) activeMapping[towerId] = sheetName
      }
      if (Object.keys(activeMapping).length > 0) {
        formData.set("sheetMapping", JSON.stringify(activeMapping))
      }
    } else {
      if (balanceFiles.length === 0) {
        toast.error("اختر ملف رصيد واحد على الأقل")
        return
      }
      for (const f of balanceFiles) formData.append("files", f)
    }
    const res = await createBatch(formData)
    handleCreateResult(res, false)
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
        description="أنشئ دفعة إرسال آلية من ملف Excel أو يدوية بإدخال المبالغ"
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
                <Tabs
                  value={mode}
                  onValueChange={(v: unknown) =>
                    setMode(v === "manual" ? "manual" : "automatic")
                  }
                  className="w-full"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="automatic">آلي (Excel)</TabsTrigger>
                    <TabsTrigger value="manual">يدوي</TabsTrigger>
                  </TabsList>
                  <TabsContent value="automatic">
                    <Field>
                      <FieldLabel htmlFor="format">صيغة الملف</FieldLabel>
                      <NativeSelect
                        id="format"
                        className="w-full"
                        value={format}
                        onChange={(e) => {
                          const next = e.target.value
                          setFormat(next === "invoice" ? "invoice" : "balance")
                          setResult(null)
                        }}
                        disabled={isSubmitting}
                      >
                        <NativeSelectOption value="balance">
                          كشف أرصدة العملاء (افتراضي)
                        </NativeSelectOption>
                        <NativeSelectOption value="invoice">
                          فواتير تفصيلية
                        </NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    {format === "balance" ? (
                      <Field>
                        <FieldLabel htmlFor="balanceFiles">
                          ملفات أرصدة العملاء (.xlsx) — ملف واحد لكل برج
                        </FieldLabel>
                        <input
                          ref={balanceInputRef}
                          id="balanceFiles"
                          type="file"
                          accept=".xlsx"
                          multiple
                          disabled={isSubmitting}
                          onChange={(e) =>
                            handleBalanceFilesSelected(e.target.files)
                          }
                          className="sr-only"
                        />
                        {balanceFiles.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {balanceFiles.map((f, idx) => (
                              <div
                                key={`${f.name}-${idx}`}
                                className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3"
                              >
                                <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate text-sm font-medium">
                                    {f.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {formatFileSize(f.size)}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => removeBalanceFile(idx)}
                                  disabled={isSubmitting}
                                  aria-label="إزالة الملف"
                                >
                                  <X />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => balanceInputRef.current?.click()}
                              disabled={isSubmitting}
                            >
                              <Upload className="size-4" />
                              إضافة ملف آخر
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => balanceInputRef.current?.click()}
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
                              اسحب الملفات هنا أو اضغط للاختيار
                            </span>
                            <span className="text-xs">
                              xlsx. فقط — ملف واحد لكل برج
                            </span>
                          </button>
                        )}
                      </Field>
                    ) : (
                      <>
                        <Field>
                          <FieldLabel htmlFor="file">
                            ملف Excel (.xlsx)
                          </FieldLabel>
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
                      </>
                    )}
                  </TabsContent>
                  <TabsContent value="manual">
                    <Alert>
                      <AlertTitle>الوضع اليدوي</AlertTitle>
                      <AlertDescription>
                        سيتم إنشاء صفوف فواتير لجميع شقق المشروع بمبلغ صفر.
                        ستُدخل المبالغ لاحقًا من صفحة الدفعة قبل الإرسال.
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                </Tabs>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting
                  ? "جارٍ الإنشاء..."
                  : mode === "manual"
                    ? "إنشاء الدفعة اليدوية"
                    : "إنشاء ومعاينة"}
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
