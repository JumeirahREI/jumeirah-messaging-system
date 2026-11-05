export function verifyBearer(
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  return header === `Bearer ${secret ?? ""}`
}
