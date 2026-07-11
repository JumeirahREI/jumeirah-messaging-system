import { PageHeaderSkeleton, CardFormSkeleton } from "@/components/skeletons"

export default function NewBatchLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton withActions />
      <CardFormSkeleton fields={3} />
    </div>
  )
}
