"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { BatchStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BatchRow } from "@/lib/server/batch-service"
import { formatArabicDate } from "@/lib/utils"

export function RecentBatchesTable({ batches }: { batches: BatchRow[] }) {
  const router = useRouter()

  if (batches.length === 0) {
    return (
      <EmptyState
        icon={<Plus />}
        title="لا توجد دفعات رسائل بعد"
        description="ابدأ بإنشاء دفعة رسائل جديدة لرفع ملف الفواتير وإرسال الرسائل."
        action={
          <Button nativeButton={false} render={<Link href="/batches/new" />}>
            <Plus data-icon="inline-start" />
            دفعة رسائل جديدة
          </Button>
        }
      />
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>العنوان</TableHead>
            <TableHead>المشروع</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead className="tabular-nums">مرسلة</TableHead>
            <TableHead className="tabular-nums">فاشلة</TableHead>
            <TableHead>تاريخ الإنشاء</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => (
            <TableRow
              key={b.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/batches/${b.id}`)}
            >
              <TableCell className="font-medium">
                <Link
                  href={`/batches/${b.id}`}
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {b.title}
                </Link>
              </TableCell>
              <TableCell>{b.projectTitle}</TableCell>
              <TableCell>
                <BatchStatusBadge status={b.status} />
              </TableCell>
              <TableCell className="tabular-nums">
                {b.sent > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {b.sent}
                  </span>
                ) : (
                  b.sent
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {b.failed > 0 ? (
                  <span className="text-destructive">{b.failed}</span>
                ) : (
                  b.failed
                )}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatArabicDate(b.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
