"use server"
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm"
import { projectSchema } from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import {
  apartmentContacts,
  apartments,
  projects,
  towers,
} from "@/lib/server/schema"
import { actor, now, safeMutation, type MutationResult } from "./shared"

export type ProjectRow = {
  id: number
  title: string
  createdAt: string | null
}

export async function listProjects(): Promise<ProjectRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(desc(projects.createdAt))
  return rows satisfies ProjectRow[]
}

export type ProjectWithCountsRow = ProjectRow & {
  towerCount: number
  apartmentCount: number
}

export async function listProjectsWithCounts(): Promise<
  ProjectWithCountsRow[]
> {
  await requireRole("operator")
  const [projectsRows, towerCounts, aptCounts] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(desc(projects.createdAt)),
    db
      .select({ projectId: towers.projectId, n: count() })
      .from(towers)
      .where(isNull(towers.deletedAt))
      .groupBy(towers.projectId),
    db
      .select({ projectId: apartments.projectId, n: count() })
      .from(apartments)
      .where(isNull(apartments.deletedAt))
      .groupBy(apartments.projectId),
  ])
  const towerMap = new Map(towerCounts.map((r) => [r.projectId, r.n]))
  const aptMap = new Map(aptCounts.map((r) => [r.projectId, r.n]))
  return projectsRows.map((p) => ({
    ...p,
    towerCount: towerMap.get(p.id) ?? 0,
    apartmentCount: aptMap.get(p.id) ?? 0,
  }))
}

export async function getProject(input: {
  id: number
}): Promise<{ id: number; title: string } | null> {
  await requireRole("operator")
  const rows = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function createProject(input: {
  title: string
}): Promise<MutationResult<{ id: number; title: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = projectSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(projects)
      .values({ title: parsed.data.title, ...actor(user) })
      .returning({ id: projects.id, title: projects.title })
    return { ok: true, data: row } as const
  })
}

export async function updateProject(input: {
  id: number
  title: string
}): Promise<MutationResult<{ id: number; title: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = projectSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(projects)
      .set({ title: parsed.data.title, updatedBy: user.id, updatedAt: now })
      .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
      .returning({ id: projects.id, title: projects.title })
    if (row.length === 0)
      return { ok: false, error: "المشروع غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function softDeleteProject(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  const result = await db
    .update(projects)
    .set({ deletedBy: user.id, deletedAt: now })
    .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
    .returning({ id: projects.id })
  if (result.length === 0) {
    return { ok: false, error: "المشروع غير موجود" } as const
  }

  const towerRows = await db
    .select({ id: towers.id })
    .from(towers)
    .where(and(eq(towers.projectId, input.id), isNull(towers.deletedAt)))
  const towerIds = towerRows.map((t) => t.id)
  if (towerIds.length > 0) {
    await db
      .update(towers)
      .set({ deletedAt: now })
      .where(inArray(towers.id, towerIds))

    const aptRows = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(
        and(inArray(apartments.towerId, towerIds), isNull(apartments.deletedAt))
      )
    const aptIds = aptRows.map((a) => a.id)
    if (aptIds.length > 0) {
      await db
        .update(apartments)
        .set({ deletedAt: now })
        .where(inArray(apartments.id, aptIds))
      await db
        .update(apartmentContacts)
        .set({ deletedAt: now })
        .where(inArray(apartmentContacts.apartmentId, aptIds))
    }
  }

  return { ok: true, data: result[0] } as const
}
