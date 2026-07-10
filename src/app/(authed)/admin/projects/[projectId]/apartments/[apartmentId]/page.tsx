import { ContactRound, Phone } from "lucide-react"

import { PageHeader } from "@/components/admin/page-header"
import { StatCard, StatGrid } from "@/components/admin/stat-card"
import {
  getApartment,
  listApartmentContacts,
  listContacts,
  listPhoneNumbersForApartment,
} from "@/lib/server/reference-data"
import { EditApartmentForm } from "./edit-apartment-form"

export default async function EditApartmentPage({
  params,
}: {
  params: Promise<{
    projectId: string
    apartmentId: string
  }>
}) {
  const { projectId, apartmentId } = await params
  const id = Number(apartmentId)
  if (Number.isNaN(id)) throw new Error("معرّف شقة غير صالح")
  const [apartment, contacts, phoneNumbers, allContacts] = await Promise.all([
    getApartment({ id }),
    listApartmentContacts({ apartmentId: id }),
    listPhoneNumbersForApartment({ apartmentId: id }),
    listContacts(),
  ])
  if (!apartment) throw new Error("الشقة غير موجودة")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={apartment.label} />

      <StatGrid>
        <StatCard
          label="جهات الاتصال"
          value={contacts.length}
          icon={ContactRound}
        />
        <StatCard
          label="أرقام الهاتف"
          value={phoneNumbers.length}
          icon={Phone}
        />
      </StatGrid>

      <EditApartmentForm
        apartmentId={id}
        projectId={projectId}
        initialLabel={apartment.label}
        initialUnitNumber={apartment.unitNumber}
        contacts={contacts}
        phoneNumbers={phoneNumbers}
        allContacts={allContacts}
      />
    </div>
  )
}
