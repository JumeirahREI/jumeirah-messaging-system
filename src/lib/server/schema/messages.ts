import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { invoices } from "./invoices"
import { phoneNumbers } from "./phone-numbers"
import { users } from "./users"

export type TemplateType = "notification" | "warning"
export type MessageStatus = "pending" | "sent" | "failed"

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    phoneNumberId: integer("phone_number_id")
      .notNull()
      .references(() => phoneNumbers.id),
    contents: text("contents").notNull(),
    templateType: text("template_type").$type<TemplateType>().notNull(),
    status: text("status").$type<MessageStatus>().notNull().default("pending"),
    errorReason: text("error_reason"),
    sentAt: text("sent_at"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: text("updated_at"),
  },
  (t) => ({
    invoiceIdx: index("messages_invoice_id_idx").on(t.invoiceId),
    phoneNumberIdx: index("messages_phone_number_id_idx").on(t.phoneNumberId),
    statusIdx: index("messages_status_idx").on(t.status),
  }),
)
