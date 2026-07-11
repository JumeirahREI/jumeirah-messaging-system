import { sql } from "drizzle-orm"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullname: text("fullname").notNull(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  mustResetPassword: integer("must_reset_password", { mode: "boolean" })
    .notNull()
    .default(false),
  createdBy: integer("created_by").references((): AnySQLiteColumn => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedBy: integer("updated_by").references((): AnySQLiteColumn => users.id),
  updatedAt: text("updated_at"),
  deletedAt: text("deleted_at"),
  deletedBy: integer("deleted_by").references((): AnySQLiteColumn => users.id),
})
