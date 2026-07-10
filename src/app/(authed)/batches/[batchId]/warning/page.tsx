import { getBatch, getWarningEligible } from "@/lib/server/batch-service"

import { WarningClient } from "./warning-client"

export default async function WarningPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const id = Number(batchId)
  if (Number.isNaN(id)) throw new Error("معرّف دفعة رسائل غير صالح")
  const batch = await getBatch({ id })
  if (!batch) throw new Error("دفعة الرسائل غير موجودة")
  if (batch.status !== "completed") {
    throw new Error("دفعة الرسائل غير مكتملة")
  }
  const eligible = await getWarningEligible({ batchId: id })
  if (eligible === null) throw new Error("تعذر تحميل البيانات")
  return <WarningClient batch={batch} eligible={eligible} />
}
