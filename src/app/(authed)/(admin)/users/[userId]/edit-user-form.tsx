"use client"
import { useRouter } from "next/navigation"
import { useState } from "react"
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
  resetUserPassword,
  softDeleteUser,
  updateUser,
} from "@/lib/server/reference-data"

export function EditUserForm({
  userId,
  initialFullname,
  initialUsername,
  initialIsAdmin,
}: {
  userId: number
  initialFullname: string
  initialUsername: string
  initialIsAdmin: boolean
}) {
  const router = useRouter()
  const [fullname, setFullname] = useState(initialFullname)
  const [username, setUsername] = useState(initialUsername)
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await updateUser({
      id: userId,
      fullname,
      username,
      isAdmin,
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تحديث المستخدم")
    router.refresh()
  }

  async function handleResetPassword() {
    setResetting(true)
    const result = await resetUserPassword({ id: userId, password: newPassword })
    setResetting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم تغيير كلمة المرور")
    setNewPassword("")
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await softDeleteUser({ id: userId })
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("تم حذف المستخدم")
    router.push("/admin/users")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <form onSubmit={handleUpdate}>
            <CardHeader>
              <CardTitle>تعديل المستخدم</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullname">الاسم الكامل</Label>
                <Input
                  id="fullname"
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">اسم المستخدم</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isAdmin"
                  checked={isAdmin}
                  onCheckedChange={(v) => setIsAdmin(v === true)}
                  disabled={submitting}
                />
                <Label htmlFor="isAdmin">صلاحيات مسؤول</Label>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button type="submit" disabled={submitting}>
                {submitting ? "جارٍ الحفظ..." : "حفظ"}
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
                    <AlertDialogTitle>حذف المستخدم؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      لن يتمكن المستخدم من تسجيل الدخول بعد الحذف. لا يمكن
                      التراجع.
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

      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>تغيير كلمة المرور</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                disabled={resetting}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              onClick={handleResetPassword}
              disabled={resetting || newPassword.length < 6}
            >
              {resetting ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
