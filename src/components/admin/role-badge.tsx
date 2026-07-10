import { Badge } from "@/components/ui/badge"
import type { ContactRole } from "@/lib/server/schema"

const ROLE_LABELS: Record<ContactRole, string> = {
  owner: "مالك",
  tenant: "مستأجر",
  manager: "مدير",
}

const ROLE_VARIANTS: Record<ContactRole, React.ComponentProps<typeof Badge>["variant"]> = {
  owner: "default",
  tenant: "secondary",
  manager: "outline",
}

export function roleLabel(role: ContactRole): string {
  return ROLE_LABELS[role] ?? role
}

export function RoleBadge({ role }: { role: ContactRole }) {
  return <Badge variant={ROLE_VARIANTS[role]}>{roleLabel(role)}</Badge>
}
