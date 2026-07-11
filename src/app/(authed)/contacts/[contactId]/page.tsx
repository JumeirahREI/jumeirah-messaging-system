import { ContactRound, Phone } from "lucide-react"

import { PageHeader } from "@/components/admin/page-header"
import { StatCard, StatGrid } from "@/components/admin/stat-card"
import {
  getContact,
  listContactApartmentLinks,
  listPhoneNumbers,
  listProjects,
} from "@/lib/server/reference-data"

import { EditContactForm } from "./edit-contact-form"

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const { contactId } = await params
  const id = Number(contactId)
  if (Number.isNaN(id)) throw new Error("معرّف جهة الاتصال غير صالح")
  const [contact, phoneNumbers, links, projects] = await Promise.all([
    getContact({ id }),
    listPhoneNumbers({ contactId: id }),
    listContactApartmentLinks({ contactId: id }),
    listProjects(),
  ])
  if (!contact) throw new Error("جهة الاتصال غير موجودة")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={contact.fullname} />

      <StatGrid>
        <StatCard
          label="أرقام الهاتف"
          value={phoneNumbers.length}
          icon={Phone}
        />
        <StatCard
          label="الشقق المرتبطة"
          value={links.length}
          icon={ContactRound}
        />
      </StatGrid>

      <EditContactForm
        contactId={id}
        initialFullname={contact.fullname}
        phoneNumbers={phoneNumbers}
        links={links}
        projects={projects}
      />
    </div>
  )
}
