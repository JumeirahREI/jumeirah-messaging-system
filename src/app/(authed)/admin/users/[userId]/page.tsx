import { getUser } from "@/lib/server/reference-data"
import { EditUserForm } from "./edit-user-form"

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const id = Number(userId)
  if (Number.isNaN(id)) throw new Error("معرّف مستخدم غير صالح")
  const user = await getUser({ id })
  if (!user) throw new Error("المستخدم غير موجود")

  return (
    <EditUserForm
      userId={id}
      initialFullname={user.fullname}
      initialUsername={user.username}
      initialIsAdmin={user.isAdmin}
    />
  )
}
