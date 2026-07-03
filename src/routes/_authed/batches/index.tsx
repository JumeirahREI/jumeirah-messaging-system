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
import { listBatches } from "@/lib/server/batch-service"

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sending: "جارٍ الإرسال",
  completed: "مكتملة",
}

export const Route = createFileRoute("/_authed/batches/")({
  loader: async () => await listBatches(),
  component: BatchesListPage,
})

function BatchesListPage() {
  const batches = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">الدفعات</h1>
        <Button render={<Link to="/batches/new" />}>
          <Plus className="size-4" />
          دفعة جديدة
        </Button>
      </div>
      {batches.length === 0 ? (
        <p className="text-muted-foreground">لا توجد دفعات بعد.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العنوان</TableHead>
                <TableHead>المشروع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>مرسلة</TableHead>
                <TableHead>فاشلة</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/batches/$batchId"
                      params={{ batchId: String(b.id) }}
                      className="hover:underline"
                    >
                      {b.title}
                    </Link>
                  </TableCell>
                  <TableCell>{b.projectTitle}</TableCell>
                  <TableCell>{STATUS_LABELS[b.status] ?? b.status}</TableCell>
                  <TableCell>{b.sent}</TableCell>
                  <TableCell>{b.failed}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {b.createdAt}
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
