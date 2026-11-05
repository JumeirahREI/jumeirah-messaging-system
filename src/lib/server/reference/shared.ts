import { and, inArray, isNull, sql, type SQL } from "drizzle-orm"
import type { SessionUser } from "@/lib/server/auth-helpers"
import type { DB } from "@/lib/server/db"
import { apartmentContacts, apartments } from "@/lib/server/schema"

export const now = sql`(datetime('now'))`

export type MutationResult<T> =
  { ok: true; data: T } | { ok: false; error: string }

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /unique constraint|UNIQUE/i.test(e.message)
}

export function safeMutation<T>(
  fn: () => Promise<MutationResult<T>>
): Promise<MutationResult<T>> {
  return fn().catch((e: unknown) => {
    if (isUniqueViolation(e)) {
      return { ok: false, error: "القيمة موجودة مسبقًا (تكرار غير مسموح)" }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
    }
  })
}

export function actor(user: SessionUser) {
  return { createdBy: user.id, updatedBy: user.id }
}

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0]

export function deletion(user: SessionUser) {
  return { deletedBy: user.id, deletedAt: now }
}

export async function softDeleteApartmentsWhere(
  tx: Tx,
  user: SessionUser,
  condition: SQL
) {
  const apartmentIds = tx
    .select({ id: apartments.id })
    .from(apartments)
    .where(condition)
  await tx
    .update(apartmentContacts)
    .set(deletion(user))
    .where(
      and(
        inArray(apartmentContacts.apartmentId, apartmentIds),
        isNull(apartmentContacts.deletedAt)
      )
    )
  await tx
    .update(apartments)
    .set(deletion(user))
    .where(and(condition, isNull(apartments.deletedAt)))
}
