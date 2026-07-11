import { PageHeaderSkeleton } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function ProjectsListLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton withActions />
      <Skeleton className="h-9 w-full sm:max-w-xs" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} size="sm" className="flex flex-col gap-3 py-5 ring-foreground/5">
            <div className="flex items-center gap-3 px-(--card-spacing)">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="mt-auto flex items-center gap-4 border-t px-(--card-spacing) pt-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
