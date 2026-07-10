import { sql } from "drizzle-orm"
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"
import { apartments } from "./apartments"
import { batchSessions } from "./batch-sessions"
import { users } from "./users"

export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchSessions.id),
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id),
    clientName: text("client_name").notNull(),
    total: real("total").notNull(),
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
    batchIdx: index("invoices_batch_id_idx").on(t.batchId),
    apartmentIdx: index("invoices_apartment_id_idx").on(t.apartmentId),
  })
)
