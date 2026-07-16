import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export function PageHeaderSkeleton({
  withDescription,
  withActions,
  className,
}: {
  withDescription?: boolean
  withActions?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Skeleton className="h-8 w-48" />
        {withDescription && <Skeleton className="h-4 w-36" />}
      </div>
      {withActions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
        </div>
      )}
    </div>
  )
}

export function CardFormSkeleton({
  fields = 3,
  maxWidth = "max-w-lg",
  titleWidth = "w-32",
}: {
  fields?: number
  maxWidth?: string
  titleWidth?: string
}) {
  return (
    <div className={cn("mx-auto w-full", maxWidth)}>
      <Card>
        <CardHeader>
          <Skeleton className={cn("h-5", titleWidth)} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
        <CardFooter className="gap-2 border-t pt-(--card-spacing)">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-16" />
        </CardFooter>
      </Card>
    </div>
  )
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-3 sm:hidden">
        {Array.from({ length: rows }).map((_, r) => (
          <Card key={r} size="sm">
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: Math.min(cols, 4) }).map((_, c) => (
                <Skeleton key={c} className="h-3 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="hidden rounded-md border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: cols }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <TableCell key={c}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function StatGridSkeleton({
  count = 2,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card
          key={i}
          size="sm"
          className="flex flex-row items-center gap-3 p-4 ring-foreground/5"
        >
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        </Card>
      ))}
    </div>
  )
}
