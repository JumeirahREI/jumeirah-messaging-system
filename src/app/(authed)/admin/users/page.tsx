import { Plus } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listUsers } from "@/lib/server/reference-data"

export default async function UsersListPage() {
  const users = await listUsers()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">المستخدمون</h1>
        <Button nativeButton={false} render={<Link href="/admin/users/new" />}>
          <Plus className="size-4" />
          مستخدم جديد
        </Button>
      </div>
      {users.length === 0 ? (
        <p className="text-muted-foreground">لا يوجد مستخدمون.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:hidden">
            {users.map((u) => (
              <Card key={u.id} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{u.fullname}</span>
                      <span className="text-sm text-muted-foreground">
                        {u.username}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/admin/users/${u.id}`} />}
                    >
                      تعديل
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {u.isAdmin ? "مسؤول" : "مشغّل"}
                    </span>
                    {u.mustResetPassword && (
                      <Badge variant="secondary">كلمة مرور مؤقتة</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden rounded-md border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>اسم المستخدم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullname}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>{u.isAdmin ? "مسؤول" : "مشغّل"}</TableCell>
                    <TableCell>
                      {u.mustResetPassword && (
                        <Badge variant="secondary">كلمة مرور مؤقتة</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/admin/users/${u.id}`} />}
                      >
                        تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
