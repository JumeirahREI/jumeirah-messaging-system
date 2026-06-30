import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"
import { users } from "./users"

export type BatchStatus = "draft" | "sending" | "completed"

export const batchSessions = sqliteTable(
  "batch_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    status: text("status").$type<BatchStatus>().notNull().default("draft"),
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
    archivedAt: text("archived_at"),
  },
  (t) => ({
    projectIdx: index("batch_sessions_project_id_idx").on(t.projectId),
    statusIdx: index("batch_sessions_status_idx").on(t.status),
  }),
)
