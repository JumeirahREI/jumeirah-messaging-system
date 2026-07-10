import { getBatch, getDraftPreview } from "@/lib/server/batch-service"

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

  return <BatchDetailClient batch={batch} preview={preview} />
}
