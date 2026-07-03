import { Link, createFileRoute } from "@tanstack/react-router"
import { Building2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authed/admin/")({
  component: AdminIndex,
})

function AdminIndex() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">الإدارة</h1>
      <p className="text-muted-foreground">
        إدارة المشاريع، الأبراج، الشقق، جهات الاتصال، والمستخدمين.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" render={<Link to="/admin/projects" />}>
          <Building2 className="size-4" />
          المشاريع والأبراج والشقق
        </Button>
        <Button variant="outline" render={<Link to="/admin/users" />}>
          <Users className="size-4" />
          المستخدمون
        </Button>
      </div>
    </div>
  )
}
