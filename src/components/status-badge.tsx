import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type BatchStatus = "draft" | "sending" | "completed"
type MessageStatus = "pending" | "sent" | "failed"

const BATCH_STATUS: Record<
  BatchStatus,
  {
    label: string
    variant: "secondary" | "default" | "outline"
    className?: string
    pulse?: boolean
  }
> = {
  draft: { label: "مسودة", variant: "secondary" },
  sending: { label: "جارٍ الإرسال", variant: "default", pulse: true },
  completed: {
    label: "مكتملة",
    variant: "outline",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
}

const MESSAGE_STATUS: Record<
  MessageStatus,
  {
    label: string
    variant: "secondary" | "default" | "destructive"
    className?: string
  }
> = {
  pending: { label: "بانتظار", variant: "secondary" },
  sent: {
    label: "مرسلة",
    variant: "default",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  failed: { label: "فاشلة", variant: "destructive" },
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const cfg = BATCH_STATUS[status]
  return (
    <Badge variant={cfg.variant} className={cn(cfg.className)}>
      {cfg.pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {cfg.label}
    </Badge>
  )
}

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const cfg = MESSAGE_STATUS[status]
  return (
    <Badge variant={cfg.variant} className={cn(cfg.className)}>
      {cfg.label}
    </Badge>
  )
}
