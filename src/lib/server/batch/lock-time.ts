export const LOCK_TIMEOUT_SECONDS = 5 * 60

export function formatSqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ")
}
