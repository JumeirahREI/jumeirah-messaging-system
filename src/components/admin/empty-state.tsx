import type { LucideIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
  className?: string
}) {
  return (
    <Empty className={cn("py-16", className)}>
      <EmptyContent>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {actionLabel && (onAction || actionHref) && (
          <div className="mt-2">
            {actionHref ? (
              <Button nativeButton={false} render={<Link href={actionHref} />}>
                {actionLabel}
              </Button>
            ) : (
              <Button onClick={onAction}>{actionLabel}</Button>
            )}
          </div>
        )}
      </EmptyContent>
    </Empty>
  )
}
