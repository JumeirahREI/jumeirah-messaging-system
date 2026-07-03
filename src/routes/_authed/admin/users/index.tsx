import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listUsers } from "@/lib/server/reference-data"

export const Route = createFileRoute("/_authed/admin/users/")({
  loader: async () => await listUsers(),
  component: UsersListPage,
})

function UsersListPage() {
  const users = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">المستخدمون</h1>
        <Button render={<Link to="/admin/users/new" />}>
          <Plus className="size-4" />
          مستخدم جديد
        </Button>
      </div>
      {users.length === 0 ? (
        <p className="text-muted-foreground">لا يوجد مستخدمون.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullname}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.isAdmin ? "مسؤول" : "مشغّل"}</TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      render={
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: String(u.id) }}
                        />
                      }
                    >
                      تعديل
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
