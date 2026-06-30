import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { apartments } from "./apartments"
import { contacts } from "./contacts"
import { users } from "./users"

export type ContactRole = "owner" | "tenant" | "manager"

export const apartmentContacts = sqliteTable(
  "apartment_contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
    role: text("role").$type<ContactRole>().notNull(),
    isNotificationRecipient: integer("is_notification_recipient", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: text("updated_at"),
    deletedAt: text("deleted_at"),
    deletedBy: integer("deleted_by").references(() => users.id),
  },
  (t) => ({
    apartmentIdx: index("apartment_contacts_apartment_id_idx").on(t.apartmentId),
    contactIdx: index("apartment_contacts_contact_id_idx").on(t.contactId),
    apartmentContactUnique: uniqueIndex(
      "apartment_contacts_apartment_contact_unique",
    )
      .on(t.apartmentId, t.contactId)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
)
