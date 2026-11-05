import { listProjectsForBatch } from "@/lib/server/batch/read"

import { NewBatchForm } from "./new-batch-form"

export default async function NewBatchPage() {
  const projects = await listProjectsForBatch()
  return <NewBatchForm projects={projects} />
}
