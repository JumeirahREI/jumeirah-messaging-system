import { sql } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { users } from "./users"

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
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
})
