"use client"
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export function TemporaryPasswordDialog({
  username,
  temporaryPassword,
  onClose,
}: {
  username: string
  temporaryPassword: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setCopied(true)
    } catch {
      toast.error("تعذر النسخ، انسخ كلمة المرور يدويًا")
    }
  }

  function close() {
    setCopied(false)
    onClose()
  }

  return (
    <AlertDialog
      open={temporaryPassword !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>كلمة المرور المؤقتة</AlertDialogTitle>
          <AlertDialogDescription>
            كلمة المرور المؤقتة للمستخدم {username}. لن تظهر مرة أخرى، سلّمها
            للمستخدم الآن. سيُطلب منه تغييرها عند أول تسجيل دخول.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <code
            dir="ltr"
            className="flex-1 rounded-md bg-muted px-3 py-2 text-center font-mono text-base tracking-wider select-all"
          >
            {temporaryPassword}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="نسخ كلمة المرور"
            onClick={copy}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={close}>تم</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
