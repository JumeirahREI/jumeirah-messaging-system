import { TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function UsersListLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <TableSkeleton rows={5} cols={4} />
    </div>
  )
}
