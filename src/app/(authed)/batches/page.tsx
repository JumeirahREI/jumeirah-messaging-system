import { listBatches } from "@/lib/server/batch-service"

import { BatchesListClient } from "./batches-list-client"

type StatusFilter = "all" | "draft" | "sending" | "completed"

function normalizeStatus(v: unknown): StatusFilter {
  return v === "draft" || v === "sending" || v === "completed" ? v : "all"
}

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; archived?: string }>
}) {
  const sp = await searchParams
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
  const status = normalizeStatus(sp.status)
  const archived = sp.archived === "true"
  const data = await listBatches({ page, status, includeArchived: archived })

  return (
    <BatchesListClient
      rows={data.rows}
      page={data.page}
      totalPages={data.totalPages}
      total={data.total}
      status={status}
      archived={archived}
    />
  )
}
