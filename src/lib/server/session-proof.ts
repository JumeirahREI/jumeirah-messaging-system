export function signSessionUpdate(
  _userId: number,
  sessionVersion: number
): { sessionVersion: number; proof: string } {
  return { sessionVersion, proof: "" }
}

export function readSessionUpdate(
  _userId: number,
  _data: unknown
): number | null {
  return null
}
