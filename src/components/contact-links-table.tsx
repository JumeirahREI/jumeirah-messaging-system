"use client"
import { Building2, Pencil, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { RoleBadge, roleLabel } from "@/components/admin/role-badge"
import { ContactLinkDialog } from "@/components/contact-link-dialog"
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
import { Card, CardContent } from "@/components/ui/card"
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
import type {
  ContactApartmentLinkRow,
  ProjectRow,
} from "@/lib/server/reference-data"
import { unlinkContact, updateContactLink } from "@/lib/server/reference-data"
import type { ContactRole } from "@/lib/server/schema"

export function ContactLinksTable({
  contactId,
  links,
  projects,
  onMutate,
}: {
  contactId: number
  links: ContactApartmentLinkRow[]
  projects: ProjectRow[]
  onMutate: () => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-medium">
          <Building2 className="size-5 text-muted-foreground" />
          الشقق المرتبطة
        </h2>
        <ContactLinkDialog
          contactId={contactId}
          projects={projects}
          onMutate={onMutate}
        />
      </div>

      {links.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Building2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              لا توجد شقق مرتبطة بهذه جهة الاتصال.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 sm:hidden">
          {links.map((l) => (
            <LinkCard key={l.id} link={l} onMutate={onMutate} />
          ))}
        </div>
      )}
      {links.length > 0 && (
        <Card className="hidden overflow-hidden p-0 sm:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="ps-(--card-spacing)">المشروع</TableHead>
                <TableHead>الشقة</TableHead>
                <TableHead>البرج</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الإشعارات</TableHead>
                <TableHead className="pe-(--card-spacing) text-end">
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => (
                <LinkRow key={l.id} link={l} onMutate={onMutate} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}

function LinkCard({
  link,
  onMutate,
}: {
  link: ContactApartmentLinkRow
  onMutate: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <Card data-size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <Link
              href={`/admin/projects/${link.projectId}`}
              className="font-medium hover:underline"
            >
              {link.apartmentLabel}
            </Link>
            <span className="text-xs text-muted-foreground">
              {link.projectTitle} — {link.towerLabel}
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
            <EditLinkDialog
              link={link}
              open={editOpen}
              onOpenChange={setEditOpen}
              onMutate={onMutate}
            />
            <UnlinkButton link={link} onMutate={onMutate} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LinkRow({
  link,
  onMutate,
}: {
  link: ContactApartmentLinkRow
  onMutate: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <TableRow>
      <TableCell className="ps-(--card-spacing)">
        <Link
          href={`/admin/projects/${link.projectId}`}
          className="hover:underline"
        >
          {link.projectTitle}
        </Link>
      </TableCell>
      <TableCell className="font-medium">{link.apartmentLabel}</TableCell>
      <TableCell>{link.towerLabel}</TableCell>
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
      <TableCell className="pe-(--card-spacing)">
        <div className="flex items-center justify-end gap-1">
          <EditLinkDialog
            link={link}
            open={editOpen}
            onOpenChange={setEditOpen}
            onMutate={onMutate}
          />
          <UnlinkButton link={link} onMutate={onMutate} />
        </div>
      </TableCell>
    </TableRow>
  )
}

function EditLinkDialog({
  link,
  open,
  onOpenChange,
  onMutate,
}: {
  link: ContactApartmentLinkRow
  open: boolean
  onOpenChange: (v: boolean) => void
  onMutate: () => void
}) {
  const [role, setRole] = useState<ContactRole>(link.role)
  const [notify, setNotify] = useState(link.isNotificationRecipient)
  const [busy, setBusy] = useState(false)

  async function handleSave() {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={busy}>
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {link.apartmentLabel} — {link.projectTitle}
          </DialogTitle>
          <DialogDescription>تعديل الدور وإعدادات الإشعار.</DialogDescription>
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
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            إلغاء
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy}>
            {busy ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnlinkButton({
  link,
  onMutate,
}: {
  link: ContactApartmentLinkRow
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
            سيتم إزالة {link.apartmentLabel} ({link.projectTitle}) من هذه جهة
            الاتصال. جهة الاتصال نفسها لن تُحذف.
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
