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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  apartmentSchema,
  contactLinkSchema,
  phoneNumberSchema,
  type ApartmentFormData,
  type ContactLinkFormData,
  type PhoneNumberFormData,
} from "@/lib/schemas"
import type {
  ApartmentContactRow,
  ApartmentPhoneNumberRow,
  ContactRow,
} from "@/lib/server/reference-data"
import {
  addPhoneNumber,
  createContact,
  deletePhoneNumber,
  linkContact,
  softDeleteApartment,
  unlinkContact,
  updateApartment,
  updateContactLink,
  updatePhoneNumber,
} from "@/lib/server/reference-data"
import type { ContactRole } from "@/lib/server/schema"

export function EditApartmentForm({
  apartmentId,
  projectId,
  towerId,
  initialLabel,
  initialUnitNumber,
  contacts,
  phoneNumbers,
  allContacts,
}: {
  apartmentId: number
  projectId: string
  towerId: string
  initialLabel: string
  initialUnitNumber: string | null
  contacts: ApartmentContactRow[]
  phoneNumbers: ApartmentPhoneNumberRow[]
  allContacts: ContactRow[]
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApartmentFormData>({
    resolver: zodResolver(apartmentSchema),
    defaultValues: {
      label: initialLabel,
      unitNumber: initialUnitNumber ?? "",
    },
  })

  async function refresh() {
    router.refresh()
  }

  async function onSubmit(data: ApartmentFormData) {
    const result = await updateApartment({
      id: apartmentId,
      label: data.label,
      unitNumber: data.unitNumber?.trim() || null,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث الشقة")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteApartment({ id: apartmentId })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف الشقة")
    router.push(`/admin/projects/${projectId}/towers/${towerId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>تعديل الشقة</CardTitle>
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
                    <AlertDialogTitle>حذف الشقة؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم حذف الشقة وروابط جهات الاتصال. لا يمكن التراجع.
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

      <ContactsSection
        apartmentId={apartmentId}
        contacts={contacts}
        phoneNumbers={phoneNumbers}
        allContacts={allContacts}
        onMutate={refresh}
      />
    </div>
  )
}

function ContactsSection({
  apartmentId,
  contacts,
  phoneNumbers,
  allContacts,
  onMutate,
}: {
  apartmentId: number
  contacts: ApartmentContactRow[]
  phoneNumbers: ApartmentPhoneNumberRow[]
  allContacts: ContactRow[]
  onMutate: () => void
}) {
  const linkedIds = new Set(contacts.map((c) => c.contactId))
  const available = allContacts.filter((c) => !linkedIds.has(c.id))
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactLinkFormData>({
    resolver: zodResolver(contactLinkSchema),
    defaultValues: {
      apartmentId,
      contactId: undefined,
      newName: "",
      role: "owner",
      isNotificationRecipient: true,
    },
  })
  const contactId = watch("contactId")
  const newName = watch("newName")
  const role = watch("role")
  const notify = watch("isNotificationRecipient")

  async function onSubmit(data: ContactLinkFormData) {
    let cid = data.contactId
    if (data.newName && data.newName.trim().length > 0) {
      const created = await createContact({ fullname: data.newName.trim() })
      if (!created.ok) {
        toast.error(created.error)
        return
      }
      cid = created.data.id
    }
    if (cid === undefined || Number.isNaN(cid)) {
      toast.error("اختر جهة اتصال أو أنشئ جديدة")
      return
    }
    const result = await linkContact({
      apartmentId,
      contactId: cid,
      role: data.role,
      isNotificationRecipient: data.isNotificationRecipient,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم ربط جهة الاتصال")
    reset({
      apartmentId,
      contactId: undefined,
      newName: "",
      role: "owner",
      isNotificationRecipient: true,
    })
    onMutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">جهات الاتصال</h2>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="existing">جهة اتصال موجودة</Label>
              <Select
                value={contactId !== undefined ? String(contactId) : ""}
                onValueChange={(v) =>
                  setValue("contactId", v && v !== "" ? Number(v) : undefined)
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="existing">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  {available.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      لا توجد متاحة
                    </SelectItem>
                  ) : (
                    available.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.fullname}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newName">أو اسم جديد</Label>
              <Input
                id="newName"
                {...register("newName")}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">الدور</Label>
              <Select
                value={role}
                onValueChange={(v) => v && setValue("role", v as ContactRole)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">مالك</SelectItem>
                  <SelectItem value="tenant">مستأجر</SelectItem>
                  <SelectItem value="manager">مدير</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Checkbox
                id="notify"
                checked={notify}
                onCheckedChange={(v) =>
                  setValue("isNotificationRecipient", v === true)
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="notify">مستلم إشعارات</Label>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={handleSubmit(onSubmit)}
                disabled={isSubmitting}
              >
                ربط
              </Button>
            </div>
          </div>
          {(errors.contactId || errors.newName || errors.role) && (
            <p className="text-sm text-destructive">
              {errors.contactId?.message ||
                errors.newName?.message ||
                errors.role?.message}
            </p>
          )}
          {newName === "" && contactId === undefined && (
            <p className="text-sm text-muted-foreground">
              اختر جهة اتصال أو أنشئ جديدة
            </p>
          )}
        </CardContent>
      </Card>

      {contacts.length === 0 ? (
        <p className="text-muted-foreground">لا توجد جهات اتصال مرتبطة.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              link={c}
              phoneNumbers={phoneNumbers.filter(
                (p) => p.contactId === c.contactId
              )}
              onMutate={onMutate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ContactCard({
  link,
  phoneNumbers,
  onMutate,
}: {
  link: ApartmentContactRow
  phoneNumbers: ApartmentPhoneNumberRow[]
  onMutate: () => void
}) {
  const [role, setRole] = useState<ContactRole>(link.role)
  const [notify, setNotify] = useState(link.isNotificationRecipient)
  const [busy, setBusy] = useState(false)
  const [editingNumber, setEditingNumber] = useState<Record<number, string>>({})
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PhoneNumberFormData>({
    resolver: zodResolver(phoneNumberSchema),
    defaultValues: {
      contactId: link.contactId,
      number: "",
    },
  })

  async function handleSaveLink() {
    setBusy(true)
    const result = await updateContactLink({
      id: link.id,
      role,
      isNotificationRecipient: notify,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث الربط")
    onMutate()
  }

  async function handleUnlink() {
    setBusy(true)
    const result = await unlinkContact({ id: link.id })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم إزالة الربط")
    onMutate()
  }

  async function handleAddNumber(data: PhoneNumberFormData) {
    setBusy(true)
    const result = await addPhoneNumber({
      contactId: data.contactId,
      number: data.number.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    reset({ contactId: link.contactId, number: "" })
    onMutate()
  }

  async function handleUpdateNumber(id: number) {
    const value = editingNumber[id]
    if (!value || value.trim().length === 0) return
    setBusy(true)
    const result = await updatePhoneNumber({ id, number: value.trim() })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setEditingNumber((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    onMutate()
  }

  async function handleDeleteNumber(id: number) {
    setBusy(true)
    const result = await deletePhoneNumber({ id })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onMutate()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{link.contactName}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={busy}
          >
            إزالة الربط
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label>الدور</Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as ContactRole)}
              disabled={busy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">مالك</SelectItem>
                <SelectItem value="tenant">مستأجر</SelectItem>
                <SelectItem value="manager">مدير</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Checkbox
              checked={notify}
              onCheckedChange={(v) => setNotify(v === true)}
              disabled={busy}
            />
            <Label>مستلم إشعارات</Label>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveLink}
              disabled={busy}
            >
              حفظ الربط
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">أرقام الهاتف</span>
          {phoneNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد أرقام.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرقم</TableHead>
                    <TableHead className="text-end">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {phoneNumbers.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.id in editingNumber ? (
                          <Input
                            value={editingNumber[p.id]}
                            onChange={(e) =>
                              setEditingNumber((prev) => ({
                                ...prev,
                                [p.id]: e.target.value,
                              }))
                            }
                            disabled={busy}
                          />
                        ) : (
                          p.number
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        {p.id in editingNumber ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleUpdateNumber(p.id)}
                              disabled={busy}
                            >
                              حفظ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setEditingNumber((prev) => {
                                  const next = { ...prev }
                                  delete next[p.id]
                                  return next
                                })
                              }
                              disabled={busy}
                            >
                              إلغاء
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setEditingNumber((prev) => ({
                                  ...prev,
                                  [p.id]: p.number,
                                }))
                              }
                              disabled={busy}
                            >
                              تعديل
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteNumber(p.id)}
                              disabled={busy}
                            >
                              حذف
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <form className="flex gap-2" onSubmit={handleSubmit(handleAddNumber)}>
            <Input
              placeholder="رقم جديد"
              {...register("number")}
              disabled={busy || isSubmitting}
            />
            <Button type="submit" disabled={busy || isSubmitting}>
              إضافة
            </Button>
          </form>
          {errors.number && (
            <p className="text-sm text-destructive">{errors.number.message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
