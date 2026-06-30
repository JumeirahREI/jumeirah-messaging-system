import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"
import { towers } from "./towers"
import { users } from "./users"

export const apartments = sqliteTable(
  "apartments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    towerId: integer("tower_id")
      .notNull()
      .references(() => towers.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    label: text("label").notNull(),
    unitNumber: text("unit_number"),
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
    labelIdx: index("apartments_label_idx").on(t.label),
    towerIdx: index("apartments_tower_id_idx").on(t.towerId),
    projectLabelUnique: uniqueIndex("apartments_project_label_unique")
      .on(t.projectId, t.label)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
)
