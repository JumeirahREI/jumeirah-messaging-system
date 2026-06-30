import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"
import { users } from "./users"

export const towers = sqliteTable(
  "towers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    label: text("label").notNull(),
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
    projectLabelUnique: uniqueIndex("towers_project_label_unique")
      .on(t.projectId, t.label)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
)
