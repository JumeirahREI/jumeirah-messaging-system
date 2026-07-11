import { PageHeaderSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function BatchDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton withDescription withActions />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
