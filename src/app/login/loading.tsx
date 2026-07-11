import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function LoginLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <Skeleton className="mx-auto h-12 w-48" />
            <Skeleton className="mx-auto h-6 w-32" />
            <Skeleton className="mx-auto h-4 w-40" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-full" />
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
