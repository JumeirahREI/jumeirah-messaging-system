export function parsePositiveInt(value: unknown): number | null {
  const n =
    typeof value === "string" && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null
}
