import { PageHeaderSkeleton, CardFormSkeleton } from "@/components/skeletons"

export default function NewProjectLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton withActions />
      <CardFormSkeleton fields={1} />
    </div>
  )
}
