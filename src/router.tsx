import {
  createRouter as createTanStackRouter,
  useRouter,
} from "@tanstack/react-router"
import { RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { routeTree } from "./routeTree.gen"

function DefaultPending() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <Skeleton className="h-10 w-64" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

function DefaultError({ error }: { error: Error }) {
  const router = useRouter()
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="font-heading text-2xl font-semibold">حدث خطأ</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={() => router.invalidate()}>
        <RotateCcwIcon data-icon="inline-start" />
        إعادة المحاولة
      </Button>
    </main>
  )
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: { session: null },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: DefaultPending,
    defaultErrorComponent: DefaultError,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
