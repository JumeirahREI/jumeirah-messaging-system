import { PageHeaderSkeleton, StatGridSkeleton, CardFormSkeleton } from "@/components/skeletons"

export default function ApartmentDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={2} />
      <CardFormSkeleton fields={2} />
    </div>
  )
}
