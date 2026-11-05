import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { invoices } from "./invoices"
import { phoneNumbers } from "./phone-numbers"
import { users } from "./users"

export type TemplateType = "notification" | "warning"
export type MessageStatus = "pending" | "sending" | "sent" | "failed" | "unknown"

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
    claimedAt: text("claimed_at"),
    attempts: integer("attempts").notNull().default(0),
    gatewayMessageId: text("gateway_message_id"),
    clientRef: text("client_ref"),
    partsSent: integer("parts_sent").notNull().default(0),
    sentAt: text("sent_at"),
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
    invoiceIdx: index("messages_invoice_id_idx").on(t.invoiceId),
    phoneNumberIdx: index("messages_phone_number_id_idx").on(t.phoneNumberId),
    statusIdx: index("messages_status_idx").on(t.status),
    liveUniqueIdx: uniqueIndex("messages_live_unique_idx")
      .on(t.invoiceId, t.phoneNumberId, t.templateType)
      .where(sql`${t.deletedAt} is null`),
    clientRefUniqueIdx: uniqueIndex("messages_client_ref_unique_idx")
      .on(t.clientRef)
      .where(sql`${t.clientRef} is not null`),
  })
)
