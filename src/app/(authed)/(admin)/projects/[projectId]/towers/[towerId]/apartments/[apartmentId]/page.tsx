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
    towerId: string
    apartmentId: string
  }>
}) {
  const { projectId, towerId, apartmentId } = await params
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
    <EditApartmentForm
      apartmentId={id}
      projectId={projectId}
      towerId={towerId}
      initialLabel={apartment.label}
      initialUnitNumber={apartment.unitNumber}
      contacts={contacts}
      phoneNumbers={phoneNumbers}
      allContacts={allContacts}
    />
  )
}
