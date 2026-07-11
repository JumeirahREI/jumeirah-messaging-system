import { Skeleton } from "@/components/ui/skeleton"

export default function AdminIndexLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-4 w-72" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  )
}
