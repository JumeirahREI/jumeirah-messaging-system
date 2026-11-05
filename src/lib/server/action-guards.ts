import type { Role, SessionUser } from "@/lib/server/auth-helpers"
import { requireRole } from "@/lib/server/auth-helpers"
import { checkRateLimit, mutationLimiter } from "@/lib/server/rate-limit"

export async function requireRoleRateLimited(role: Role): Promise<SessionUser> {
  const user = await requireRole(role)
  const allowed = await checkRateLimit(mutationLimiter, `mutation:${user.id}`)
  if (!allowed) throw new Error("محاولات كثيرة. حاول مرة أخرى لاحقًا")
  return user
}

function requireObject(input: unknown): object {
  if (typeof input !== "object" || input === null)
    throw new Error("إدخال غير صالح")
  return input
}

export function parseBatchIdInput(input: unknown): number {
  const batchId = (requireObject(input) as { batchId?: unknown }).batchId
  if (typeof batchId !== "number") throw new Error("معرّف الدفعة مطلوب")
  return batchId
}

export function parseIdInput(input: unknown): number {
  const id = (requireObject(input) as { id?: unknown }).id
  if (typeof id !== "number") throw new Error("المعرّف مطلوب")
  return id
}
