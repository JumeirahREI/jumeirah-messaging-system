import { CardFormSkeleton } from "@/components/skeletons"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function EditUserLoading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <CardFormSkeleton fields={2} maxWidth="max-w-md" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
