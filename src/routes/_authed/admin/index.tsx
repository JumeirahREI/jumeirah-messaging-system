import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/admin/")({
  component: AdminIndex,
})

function AdminIndex() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-medium">الإدارة</h1>
      <p className="text-muted-foreground">
        إدارة المشاريع، الأبراج، الشقق، جهات الاتصال، والمستخدمين.
      </p>
    </div>
  )
}
