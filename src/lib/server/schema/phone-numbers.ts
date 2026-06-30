import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { contacts } from "./contacts"
import { users } from "./users"

export const phoneNumbers = sqliteTable(
  "phone_numbers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
    number: text("number").notNull(),
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
    contactIdx: index("phone_numbers_contact_id_idx").on(t.contactId),
  }),
)
