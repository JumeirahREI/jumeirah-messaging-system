import { getBatch, getDraftPreview } from "@/lib/server/batch-service"
import { listContacts } from "@/lib/server/reference-data"

import { BatchDetailClient } from "./batch-detail-client"

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const id = Number(batchId)
  if (Number.isNaN(id)) throw new Error("معرّف دفعة رسائل غير صالح")
  const batch = await getBatch({ id })
  if (!batch) throw new Error("دفعة الرسائل غير موجودة")
  const preview =
    batch.status === "draft" ? await getDraftPreview({ batchId: id }) : null
  const allContacts = batch.status === "draft" ? await listContacts() : []

  return (
    <BatchDetailClient
      batch={batch}
      preview={preview}
      allContacts={allContacts}
    />
  )
}
