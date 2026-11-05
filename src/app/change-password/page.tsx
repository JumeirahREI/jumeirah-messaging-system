import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/server/auth-helpers"
import { ChangePasswordForm } from "./change-password-form"

export default async function ChangePasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/session-expired")
  return <ChangePasswordForm requireCurrentPassword={!user.mustResetPassword} />
}
