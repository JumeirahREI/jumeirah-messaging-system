import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function BatchesListLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton withDescription withActions />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-32" />
      </div>
      <TableSkeleton rows={6} cols={7} />
    </div>
  )
}
