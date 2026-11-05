import { listContactsPage } from "@/lib/server/reference/contacts"
import { listProjects } from "@/lib/server/reference/projects"

import { ContactsListClient } from "./contacts-list-client"

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; page?: string }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ""
  const projectId = sp.project ? Number(sp.project) : null
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
  const [data, projects] = await Promise.all([
    listContactsPage({ q, projectId, page }),
    listProjects(),
  ])

  return (
    <ContactsListClient
      rows={data.rows}
      page={data.page}
      totalPages={data.totalPages}
      total={data.total}
      q={q}
      projectId={projectId}
      projects={projects}
    />
  )
}
