export function isLockExpired(lockedAt: string | null, now?: Date): boolean {
  throw new Error("not implemented")
}

export type LockCheck = { ok: true } | { ok: false; error: string }

export async function checkLockHeld(
  batchId: number,
  userId: number
): Promise<LockCheck> {
  throw new Error("not implemented")
}

export async function assertLockHeld(
  batchId: number,
  userId: number
): Promise<void> {
  throw new Error("not implemented")
}
