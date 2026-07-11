import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function ProjectDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={2} />
      <section className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-64 w-full" />
      </section>
    </div>
  )
}
