const PHONE =
  /(?<!\d)(?:(?:\+|00)?967[\s-]?|0)?7\d{8}(?!\d)/g
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const PASSWORD_PARAM = /\b(password|passwd|pwd)=[^&\s"']*/gi
const P_PARAM = /(^|[?&\s])P=[^&\s"']*/g
const PASSWORD_JSON = /("(?:password|passwd|pwd|P)"\s*:\s*")[^"]*(")/gi
const SENSITIVE_KEY = /^(password|passwd|pwd|authorization|cookie|set-cookie)$/i
const MAX_DEPTH = 20
const REDACTED = "[redacted]"

function scrubString(value: string): string {
  const smsPassword = process.env.ALAWAEL_PASSWORD
  const withoutSecret = smsPassword
    ? value.split(smsPassword).join(REDACTED)
    : value
  return withoutSecret
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(PASSWORD_JSON, `$1${REDACTED}$2`)
    .replace(PASSWORD_PARAM, `$1=${REDACTED}`)
    .replace(P_PARAM, `$1P=${REDACTED}`)
    .replace(PHONE, "[redacted-phone]")
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubString(value)
  if (typeof value !== "object" || value === null || depth > MAX_DEPTH) {
    return value
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1))
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (SENSITIVE_KEY.test(key) || key === "P") && typeof entry === "string"
        ? REDACTED
        : scrubValue(entry, depth + 1),
    ])
  )
}

export function scrubEvent<T>(event: T): T {
  return scrubValue(event, 0) as T
}

export function parseSampleRate(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined || value.trim() === "") return fallback
  const rate = Number(value)
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback
}
