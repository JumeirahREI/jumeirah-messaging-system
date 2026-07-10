"use client"

import { useEffect } from "react"
import { toast } from "sonner"

const ERROR_MESSAGES: Record<string, string> = {
  "admin-only": "هذه الصفحة متاحة للمسؤولين فقط",
}

export function DashboardErrorToast({ error }: { error?: string }) {
  useEffect(() => {
    if (error && ERROR_MESSAGES[error]) {
      toast.error(ERROR_MESSAGES[error])
    }
  }, [error])

  return null
}
