const YEMEN_COUNTRY_CODE = "967"
const YEMENI_LOCAL_REGEX = /^7[01378][0-9]{7}$/

export function extractLocalNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("00967")) return digits.slice(5)
  if (digits.startsWith("967")) return digits.slice(3)
  return digits
}

export function isValidYemeniPhone(local: string): boolean {
  return YEMENI_LOCAL_REGEX.test(local)
}

export function toStorageFormat(local: string): string {
  return `${YEMEN_COUNTRY_CODE}${local}`
}

export function toDisplayFormat(stored: string): string {
  if (stored.startsWith(YEMEN_COUNTRY_CODE)) return stored.slice(3)
  return stored
}
