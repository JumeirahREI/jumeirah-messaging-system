"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { ContactRound, Pencil, Phone, Plus, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { AddContactDialog } from "@/components/add-contact-dialog"
import { RoleBadge, roleLabel } from "@/components/admin/role-badge"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
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
  phoneNumberSchema,
  type ApartmentFormData,
  type PhoneNumberFormData,
} from "@/lib/schemas"
import type {
  ApartmentContactRow,
  ApartmentPhoneNumberRow,
  ContactRow,
} from "@/lib/server/reference-data"
import {
  addPhoneNumber,
  deletePhoneNumber,
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
  initialLabel,
  initialUnitNumber,
  contacts,
  phoneNumbers,
  allContacts,
  isAdmin = false,
}: {
  apartmentId: number
  projectId: string
  initialLabel: string
  initialUnitNumber: string | null
  contacts: ApartmentContactRow[]
  phoneNumbers: ApartmentPhoneNumberRow[]
  allContacts: ContactRow[]
  isAdmin?: boolean
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
    router.push(`/admin/projects/${projectId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>تعديل الشقة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
            <CardFooter className="justify-between">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={deleting}
                      className="hover:bg-destructive/10 hover:text-destructive"
                      aria-label="حذف"
                    >
                      <Trash2 />
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
          </Card>
        </form>
      )}

      <ContactsTable
        apartmentId={apartmentId}
        contacts={contacts}
        phoneNumbers={phoneNumbers}
        allContacts={allContacts}
        onMutate={refresh}
      />
    </div>
  )
}

function ContactsTable({
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
  const [addOpen, setAddOpen] = useState(false)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-medium">
          <ContactRound className="size-5 text-muted-foreground" />
          جهات الاتصال
        </h2>
        <AddContactDialog
          apartmentId={apartmentId}
          available={allContacts.filter(
            (c) => !contacts.some((lc) => lc.contactId === c.id)
          )}
          open={addOpen}
          onOpenChange={setAddOpen}
          onMutate={onMutate}
        />
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <ContactRound className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              لا توجد جهات اتصال مرتبطة بهذه الشقة.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:hidden">
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
          <Card className="hidden overflow-hidden p-0 sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="ps-(--card-spacing)">الاسم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الإشعارات</TableHead>
                  <TableHead>أرقام الهاتف</TableHead>
                  <TableHead className="pe-(--card-spacing) text-end">
                    إجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <ContactRow
                    key={c.id}
                    link={c}
                    phoneNumbers={phoneNumbers.filter(
                      (p) => p.contactId === c.contactId
                    )}
                    onMutate={onMutate}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </section>
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
  const [editOpen, setEditOpen] = useState(false)

  return (
    <Card data-size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="leading-tight font-medium">
              {link.contactName}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <RoleBadge role={link.role} />
              {link.isNotificationRecipient ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  مستلم إشعارات
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  غير مُفعّل للإشعارات
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <EditContactDialog
              link={link}
              phoneNumbers={phoneNumbers}
              open={editOpen}
              onOpenChange={setEditOpen}
              onMutate={onMutate}
            />
            <UnlinkContactButton link={link} onMutate={onMutate} />
          </div>
        </div>
        {phoneNumbers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {phoneNumbers.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
              >
                <Phone className="size-3 text-muted-foreground" />
                {p.number}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UnlinkContactButton({
  link,
  onMutate,
}: {
  link: ApartmentContactRow
  onMutate: () => void
}) {
  const [busy, setBusy] = useState(false)

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

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-4" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>إزالة الربط؟</AlertDialogTitle>
          <AlertDialogDescription>
            سيتم إزالة {link.contactName} من هذه الشقة. جهة الاتصال نفسها لن
            تُحذف.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={handleUnlink}>إزالة</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ContactRow({
  link,
  phoneNumbers,
  onMutate,
}: {
  link: ApartmentContactRow
  phoneNumbers: ApartmentPhoneNumberRow[]
  onMutate: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <TableRow>
      <TableCell className="ps-(--card-spacing) font-medium">
        {link.contactName}
      </TableCell>
      <TableCell>
        <RoleBadge role={link.role} />
      </TableCell>
      <TableCell>
        {link.isNotificationRecipient ? (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            نعم
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">لا</span>
        )}
      </TableCell>
      <TableCell>
        {phoneNumbers.length === 0 ? (
          <span className="text-xs text-muted-foreground">لا توجد</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {phoneNumbers.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
              >
                <Phone className="size-3 text-muted-foreground" />
                {p.number}
              </span>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="pe-(--card-spacing)">
        <div className="flex items-center justify-end gap-1">
          <EditContactDialog
            link={link}
            phoneNumbers={phoneNumbers}
            open={editOpen}
            onOpenChange={setEditOpen}
            onMutate={onMutate}
          />
          <UnlinkContactButton link={link} onMutate={onMutate} />
        </div>
      </TableCell>
    </TableRow>
  )
}

function EditContactDialog({
  link,
  phoneNumbers,
  open,
  onOpenChange,
  onMutate,
}: {
  link: ApartmentContactRow
  phoneNumbers: ApartmentPhoneNumberRow[]
  open: boolean
  onOpenChange: (v: boolean) => void
  onMutate: () => void
}) {
  const [role, setRole] = useState<ContactRole>(link.role)
  const [notify, setNotify] = useState(link.isNotificationRecipient)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PhoneNumberFormData>({
    resolver: zodResolver(phoneNumberSchema),
    defaultValues: { contactId: link.contactId, number: "" },
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
    if (!editValue.trim()) return
    setBusy(true)
    const result = await updatePhoneNumber({ id, number: editValue.trim() })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setEditingId(null)
    setEditValue("")
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={busy}>
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{link.contactName}</DialogTitle>
          <DialogDescription>
            تعديل الدور وإعدادات الإشعار وأرقام الهاتف.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>الدور</Label>
              <NativeSelect
                className="w-full"
                value={role}
                onChange={(e) =>
                  e.target.value && setRole(e.target.value as ContactRole)
                }
                disabled={busy}
              >
                <NativeSelectOption value="owner">
                  {roleLabel("owner")}
                </NativeSelectOption>
                <NativeSelectOption value="tenant">
                  {roleLabel("tenant")}
                </NativeSelectOption>
                <NativeSelectOption value="manager">
                  {roleLabel("manager")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pt-7">
              <Checkbox
                checked={notify}
                onCheckedChange={(v) => setNotify(v === true)}
                disabled={busy}
              />
              <span className="text-sm">مستلم إشعارات</span>
            </label>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleSaveLink}
            disabled={busy}
            className="w-fit"
          >
            حفظ الربط
          </Button>

          <div className="h-px bg-border" />

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Phone className="size-4 text-muted-foreground" />
              أرقام الهاتف
            </span>
            {phoneNumbers.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أرقام.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {phoneNumbers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    {editingId === p.id ? (
                      <>
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          disabled={busy}
                          className="h-8 flex-1 font-mono"
                        />
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
                          onClick={() => {
                            setEditingId(null)
                            setEditValue("")
                          }}
                          disabled={busy}
                        >
                          إلغاء
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-sm">{p.number}</span>
                        <div className="ms-auto flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(p.id)
                              setEditValue(p.number)
                            }}
                            disabled={busy}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleDeleteNumber(p.id)}
                            disabled={busy}
                            className="hover:bg-destructive/10 hover:text-destructive"
                            aria-label="حذف الرقم"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={handleSubmit(handleAddNumber)}
            >
              <Input
                placeholder="رقم جديد"
                {...register("number")}
                disabled={busy || isSubmitting}
                className="min-w-40 flex-1 font-mono"
              />
              <Button type="submit" disabled={busy || isSubmitting}>
                <Plus className="size-4" />
                إضافة
              </Button>
            </form>
            {errors.number && (
              <p className="text-sm text-destructive">
                {errors.number.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              إغلاق
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
