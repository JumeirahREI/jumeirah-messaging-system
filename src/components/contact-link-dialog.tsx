"use client"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import type {
  ApartmentWithTowerRow,
  ProjectRow,
} from "@/lib/server/reference-data"
import {
  linkContact,
  listApartmentsByProject,
} from "@/lib/server/reference-data"
import type { ContactRole } from "@/lib/server/schema"

export function ContactLinkDialog({
  contactId,
  projects,
  onMutate,
}: {
  contactId: number
  projects: ProjectRow[]
  onMutate: () => void
}) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [apartmentId, setApartmentId] = useState<number | null>(null)
  const [apartments, setApartments] = useState<ApartmentWithTowerRow[]>([])
  const [role, setRole] = useState<ContactRole>("owner")
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)

  async function handleProjectChange(id: number) {
    setProjectId(id)
    setApartmentId(null)
    setBusy(true)
    const rows = await listApartmentsByProject({ projectId: id })
    setApartments(rows)
    setBusy(false)
  }

  async function handleSubmit() {
    if (apartmentId === null) {
      toast.error("اختر شقة")
      return
    }
    setBusy(true)
    const result = await linkContact({
      contactId,
      apartmentId,
      role,
      isNotificationRecipient: notify,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم ربط جهة الاتصال بالشقة")
    setOpen(false)
    setProjectId(null)
    setApartmentId(null)
    setApartments([])
    setRole("owner")
    setNotify(true)
    onMutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setProjectId(null)
          setApartmentId(null)
          setApartments([])
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            ربط بشقة
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ربط جهة الاتصال بشقة</DialogTitle>
          <DialogDescription>
            اختر المشروع ثم الشقة، وحدد الدور وإعدادات الإشعار.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project">المشروع</Label>
            <NativeSelect
              id="project"
              className="w-full"
              value={projectId !== null ? String(projectId) : ""}
              onChange={(e) =>
                e.target.value && handleProjectChange(Number(e.target.value))
              }
              disabled={busy}
            >
              <NativeSelectOption value="" disabled>
                اختر...
              </NativeSelectOption>
              {projects.map((p) => (
                <NativeSelectOption key={p.id} value={String(p.id)}>
                  {p.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="apartment">الشقة</Label>
            <NativeSelect
              id="apartment"
              className="w-full"
              value={apartmentId !== null ? String(apartmentId) : ""}
              onChange={(e) =>
                e.target.value
                  ? setApartmentId(Number(e.target.value))
                  : setApartmentId(null)
              }
              disabled={busy || projectId === null}
            >
              <NativeSelectOption value="" disabled>
                {projectId === null ? "اختر مشروعًا أولًا" : "اختر..."}
              </NativeSelectOption>
              {apartments.map((a) => (
                <NativeSelectOption key={a.id} value={String(a.id)}>
                  {a.label} — {a.towerLabel}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">الدور</Label>
              <NativeSelect
                id="role"
                className="w-full"
                value={role}
                onChange={(e) =>
                  e.target.value && setRole(e.target.value as ContactRole)
                }
                disabled={busy}
              >
                <NativeSelectOption value="owner">مالك</NativeSelectOption>
                <NativeSelectOption value="tenant">مستأجر</NativeSelectOption>
                <NativeSelectOption value="manager">مدير</NativeSelectOption>
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
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            إلغاء
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "جارٍ الحفظ..." : "ربط"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
