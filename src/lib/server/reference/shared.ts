import { sql } from "drizzle-orm"
import type { SessionUser } from "@/lib/server/auth-helpers"

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
