import { createHmac, timingSafeEqual } from "node:crypto"

function sign(userId: number, sessionVersion: number): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is required")
  return createHmac("sha256", secret)
    .update(`session-version:${userId}:${sessionVersion}`)
    .digest()
}

export function signSessionUpdate(
  userId: number,
  sessionVersion: number
): { sessionVersion: number; proof: string } {
  return {
    sessionVersion,
    proof: sign(userId, sessionVersion).toString("hex"),
  }
}

export function readSessionUpdate(
  userId: number,
  data: unknown
): number | null {
  if (typeof data !== "object" || data === null) return null
  const { sessionVersion, proof } = data as {
    sessionVersion?: unknown
    proof?: unknown
  }
  if (
    typeof sessionVersion !== "number" ||
    !Number.isInteger(sessionVersion) ||
    typeof proof !== "string"
  )
    return null
  const given = Buffer.from(proof, "hex")
  const expected = sign(userId, sessionVersion)
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? sessionVersion
    : null
}
