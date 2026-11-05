import { createHash, timingSafeEqual } from "node:crypto"

const digest = (value: string) => createHash("sha256").update(value).digest()

export function verifyBearer(
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret?.trim() || !header) return false
  const token = /^Bearer (\S+)$/i.exec(header)?.[1]
  if (!token) return false
  return timingSafeEqual(digest(token), digest(secret))
}
