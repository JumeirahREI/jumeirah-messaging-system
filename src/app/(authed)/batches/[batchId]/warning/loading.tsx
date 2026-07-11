import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function WarningLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton withActions />
      <Skeleton className="h-20 w-full" />
      <TableSkeleton rows={6} cols={5} />
    </div>
  )
}
