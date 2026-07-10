import Link from "next/link"
import { Building2, MessageSquare, Plus, Users } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { auth } from "@/auth"
import { getRecentBatches } from "@/lib/server/batch-service"

import { DashboardErrorToast } from "./dashboard-error-toast"
import { RecentBatchesTable } from "./recent-batches-table"

function QuickAction({
  href,
  icon,
  label,
  description,
}: {
  href: string
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href={href} />}
        >
          <Plus />
        </Button>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  const { error } = await searchParams
  const recentBatches = await getRecentBatches()
  const user = session!.user

  return (
    <div className="flex flex-col gap-8">
      <DashboardErrorToast error={error} />

      <PageHeader
        title={`مرحبًا، ${user.fullname}`}
        description={`${user.isAdmin ? "مسؤول" : "مشغّل"} — لوحة التحكم`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickAction
          href="/batches/new"
          icon={<Plus />}
          label="دفعة رسائل جديدة"
          description="ارفع ملف فواتير وأرسل الرسائل"
        />
        <QuickAction
          href="/batches"
          icon={<MessageSquare />}
          label="دفعات الرسائل"
          description="عرض وإدارة دفعات الرسائل السابقة"
        />
        {user.isAdmin ? (
          <QuickAction
            href="/admin/projects"
            icon={<Building2 />}
            label="إدارة البيانات"
            description="المشاريع والأبراج والشقق"
          />
        ) : (
          <QuickAction
            href="/batches"
            icon={<Users />}
            label="السجل"
            description="استعراض دفعات الرسائل المكتملة"
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">آخر دفعات الرسائل</h2>
        <RecentBatchesTable batches={recentBatches} />
      </div>
    </div>
  )
}
