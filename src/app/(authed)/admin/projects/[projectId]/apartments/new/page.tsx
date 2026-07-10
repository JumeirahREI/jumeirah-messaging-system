import { listTowers } from "@/lib/server/reference-data"
import { NewApartmentForm } from "./new-apartment-form"

export default async function NewApartmentPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const towers = await listTowers({ projectId: Number(projectId) })
  return <NewApartmentForm projectId={projectId} towers={towers} />
}
