import { getCurrentUser } from "@/lib/server/auth-helpers"
import {
  getBatch,
  getDraftPreview,
  getManualDraftInvoices,
} from "@/lib/server/batch-service"
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
  const isDraft = batch.status === "draft"
  const preview = isDraft ? await getDraftPreview({ batchId: id }) : null
  const manualInvoices =
    isDraft && batch.mode === "manual"
      ? await getManualDraftInvoices({ batchId: id })
      : null
  const allContacts = isDraft ? await listContacts() : []
  const currentUser = await getCurrentUser()

  return (
    <BatchDetailClient
      batch={batch}
      preview={preview}
      allContacts={allContacts}
      manualInvoices={manualInvoices}
      currentUserId={currentUser?.id ?? null}
      isAdmin={currentUser?.isAdmin ?? false}
    />
  )
}
