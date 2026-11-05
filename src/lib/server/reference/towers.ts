"use server"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import { towerSchema } from "@/lib/schemas"
import { requireRole } from "@/lib/server/auth-helpers"
import { requireRoleRateLimited } from "@/lib/server/action-guards"
import { db } from "@/lib/server/db"
import { apartments, towers } from "@/lib/server/schema"
import {
  actor,
  deletion,
  now,
  safeMutation,
  softDeleteApartmentsWhere,
  type MutationResult,
} from "./shared"

export type TowerRow = {
  id: number
  projectId: number
  label: string
  createdAt: string | null
}

export async function listTowers(input: {
  projectId: number
}): Promise<TowerRow[]> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: towers.id,
      projectId: towers.projectId,
      label: towers.label,
      createdAt: towers.createdAt,
    })
    .from(towers)
    .where(and(eq(towers.projectId, input.projectId), isNull(towers.deletedAt)))
    .orderBy(desc(towers.createdAt))
  return rows satisfies TowerRow[]
}

export type TowerWithCountsRow = TowerRow & { apartmentCount: number }

export async function listTowersWithCounts(input: {
  projectId: number
}): Promise<TowerWithCountsRow[]> {
  await requireRole("operator")
  const [towerRows, aptCounts] = await Promise.all([
    db
      .select({
        id: towers.id,
        projectId: towers.projectId,
        label: towers.label,
        createdAt: towers.createdAt,
      })
      .from(towers)
      .where(
        and(eq(towers.projectId, input.projectId), isNull(towers.deletedAt))
      )
      .orderBy(desc(towers.createdAt)),
    db
      .select({ towerId: apartments.towerId, n: count() })
      .from(apartments)
      .where(
        and(
          eq(apartments.projectId, input.projectId),
          isNull(apartments.deletedAt)
        )
      )
      .groupBy(apartments.towerId),
  ])
  const aptMap = new Map(aptCounts.map((r) => [r.towerId, r.n]))
  return towerRows.map((t) => ({
    ...t,
    apartmentCount: aptMap.get(t.id) ?? 0,
  }))
}

export async function getTower(input: {
  id: number
}): Promise<{ id: number; projectId: number; label: string } | null> {
  await requireRole("operator")
  const rows = await db
    .select({
      id: towers.id,
      projectId: towers.projectId,
      label: towers.label,
    })
    .from(towers)
    .where(and(eq(towers.id, input.id), isNull(towers.deletedAt)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export async function createTower(input: {
  projectId: number
  label: string
}): Promise<MutationResult<{ id: number; projectId: number; label: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = towerSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const [row] = await db
      .insert(towers)
      .values({
        projectId: input.projectId,
        label: parsed.data.label,
        ...actor(user),
      })
      .returning({
        id: towers.id,
        projectId: towers.projectId,
        label: towers.label,
      })
    return { ok: true, data: row } as const
  })
}

export async function updateTower(input: {
  id: number
  label: string
}): Promise<MutationResult<{ id: number; label: string }>> {
  const user = await requireRoleRateLimited("admin")
  const parsed = towerSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "خطأ" }
  return safeMutation(async () => {
    const row = await db
      .update(towers)
      .set({ label: parsed.data.label, updatedBy: user.id, updatedAt: now })
      .where(and(eq(towers.id, input.id), isNull(towers.deletedAt)))
      .returning({ id: towers.id, label: towers.label })
    if (row.length === 0)
      return { ok: false, error: "البرج غير موجود" } as const
    return { ok: true, data: row[0] } as const
  })
}

export async function softDeleteTower(input: {
  id: number
}): Promise<MutationResult<{ id: number }>> {
  const user = await requireRoleRateLimited("admin")
  return db.transaction(async (tx) => {
    const result = await tx
      .update(towers)
      .set(deletion(user))
      .where(and(eq(towers.id, input.id), isNull(towers.deletedAt)))
      .returning({ id: towers.id })
    if (result.length === 0) {
      return { ok: false, error: "البرج غير موجود" } as const
    }
    await softDeleteApartmentsWhere(tx, user, eq(apartments.towerId, input.id))
    return { ok: true, data: result[0] } as const
  })
}
