import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getTower, listApartments } from "@/lib/server/reference-data"
import { EditTowerForm } from "./edit-tower-form"

export default async function EditTowerPage({
  params,
}: {
  params: Promise<{ projectId: string; towerId: string }>
}) {
  const { projectId, towerId } = await params
  const id = Number(towerId)
  if (Number.isNaN(id)) throw new Error("معرّف برج غير صالح")
  const [tower, apartments] = await Promise.all([
    getTower({ id }),
    listApartments({ towerId: id }),
  ])
  if (!tower) throw new Error("البرج غير موجود")

  return (
    <div className="flex flex-col gap-6">
      <EditTowerForm towerId={id} initialLabel={tower.label} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">الشقق</h2>
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/projects/${projectId}/towers/${towerId}/apartments/new`}
              />
            }
          >
            شقة جديدة
          </Button>
        </div>
        {apartments.length === 0 ? (
          <p className="text-muted-foreground">لا توجد شقق بعد.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>رقم الوحدة</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apartments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.unitNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            href={`/admin/projects/${projectId}/towers/${towerId}/apartments/${a.id}`}
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
    </div>
  )
}
