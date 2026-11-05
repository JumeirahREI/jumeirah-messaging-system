import { redact } from "@/lib/server/redact"

export type SmsResult =
  | { ok: true; messageId: string }
  | {
      ok: false
      outcome?: "failed" | "ambiguous"
      error: string
      partsSent?: number
    }

export type SmsStatusLookup =
  "unsupported" | "delivered" | "failed" | "pending" | "unknown"

export interface SmsSendOptions {
  clientRef?: string
}

export interface SmsGateway {
  send: (to: string, body: string, opts?: SmsSendOptions) => Promise<SmsResult>
  lookupStatus?: (ref: string) => Promise<SmsStatusLookup>
}

export class FakeSmsGateway implements SmsGateway {
  private failRate: number

  constructor(opts: { failRate?: number } = {}) {
    this.failRate = opts.failRate ?? 0
  }

  async send(to: string, body: string): Promise<SmsResult> {
    console.log(`[FakeSms] to=${to} body=${body.slice(0, 40)}…`)
    if (this.failRate > 0 && Math.random() < this.failRate) {
      return { ok: false, outcome: "failed", error: "محاكاة فشل الإرسال" }
    }
    return {
      ok: true,
      messageId: `fake-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    }
  }

  async lookupStatus(): Promise<SmsStatusLookup> {
    return "unsupported"
  }
}

const DEFAULT_SEND_URL = "https://sms.alawaeltec.com/MainServlet"
const DEFAULT_CODING = 2
const DEFAULT_CONNECT_TIMEOUT_MS = 8_000
const DEFAULT_SEND_TIMEOUT_MS = 40_000
const PART_CHAR_LIMIT = 326
const MIN_PART_POSITION = Math.floor(PART_CHAR_LIMIT / 3)
const SUCCESS_CODE = 0
const PRE_SEND_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ERR_INVALID_URL",
])
const AMBIGUOUS_SUFFIX = "حالة الإرسال غير مؤكدة"

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AlawaelConfig {
  orgName: string
  username: string
  password: string
  sendUrl?: string
  balanceUrl?: string
  coding?: number
  connectTimeoutMs?: number
  sendTimeoutMs?: number
  clientRefParam?: string
}

type FailedSmsResult = Extract<SmsResult, { ok: false }>

function positiveInt(
  value: number | string | undefined,
  fallback: number
): number {
  if (value === undefined || value === "") return fallback
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function breakMessageIntoParts(message: string): string[] {
  const chars = Array.from(message)
  const length = chars.length
  if (length <= PART_CHAR_LIMIT) return [message]

  const parts: string[] = []
  let index = 0
  while (index < length) {
    if (index + PART_CHAR_LIMIT >= length) {
      parts.push(chars.slice(index).join(""))
      break
    }
    const window = chars.slice(index, index + PART_CHAR_LIMIT)
    let endPos = Math.max(
      window.lastIndexOf("."),
      window.lastIndexOf(":"),
      window.lastIndexOf("\n")
    )
    if (endPos < MIN_PART_POSITION) endPos = window.lastIndexOf(" ")
    if (endPos < MIN_PART_POSITION) endPos = PART_CHAR_LIMIT - 1
    parts.push(chars.slice(index, index + endPos + 1).join(""))
    index += endPos + 1
  }
  return parts
}

type ParsedSmsResponse =
  | { kind: "empty" }
  | { kind: "invalid"; raw: string }
  | { kind: "ok"; code: number; message: string; id: string | null }

function parseSmsResponse(response: string): ParsedSmsResponse {
  const trimmed = response.trim()
  if (!trimmed) return { kind: "empty" }
  const firstColon = trimmed.indexOf(":")
  const codeText = (
    firstColon === -1 ? trimmed : trimmed.slice(0, firstColon)
  ).trim()
  if (!/^-?\d+$/.test(codeText)) return { kind: "invalid", raw: trimmed }
  const code = Number(codeText)
  const rest = firstColon === -1 ? "" : trimmed.slice(firstColon + 1)
  if (code !== SUCCESS_CODE)
    return { kind: "ok", code, message: rest, id: null }
  const lastColon = rest.lastIndexOf(":")
  return {
    kind: "ok",
    code,
    message: lastColon === -1 ? rest : rest.slice(0, lastColon),
    id: lastColon === -1 ? null : rest.slice(lastColon + 1) || null,
  }
}

function errorCode(err: unknown): string | undefined {
  let current: unknown = err
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current !== "object") return undefined
    const { code, cause } = current as { code?: unknown; cause?: unknown }
    if (typeof code === "string") return code
    current = cause
  }
  return undefined
}

function errorDetail(err: unknown): string {
  const cause = err instanceof Error ? err.cause : undefined
  const source = cause instanceof Error ? cause : err
  return source instanceof Error ? source.message : String(source)
}

export class AlawaelSmsGateway implements SmsGateway {
  readonly connectTimeoutMs: number
  readonly sendTimeoutMs: number
  private readonly orgName: string
  private readonly username: string
  private readonly password: string
  private readonly sendUrl: string
  private readonly balanceUrl: string
  private readonly coding: number
  private readonly clientRefParam: string
  private readonly fetchFn: FetchLike

  constructor(config: AlawaelConfig, opts: { fetchFn?: FetchLike } = {}) {
    const missing = (["orgName", "username", "password"] as const).filter(
      (field) => !config[field]
    )
    if (missing.length)
      throw new Error(`Missing required Alawael config: ${missing.join(", ")}`)
    this.orgName = config.orgName
    this.username = config.username
    this.password = config.password
    this.sendUrl = config.sendUrl ?? DEFAULT_SEND_URL
    if (!this.sendUrl.startsWith("https://"))
      throw new Error("ALAWAEL_SEND_URL must use HTTPS")
    this.balanceUrl = config.balanceUrl ?? ""
    this.coding = config.coding ?? DEFAULT_CODING
    this.connectTimeoutMs = positiveInt(
      config.connectTimeoutMs ?? process.env.ALAWAEL_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS
    )
    this.sendTimeoutMs = positiveInt(
      config.sendTimeoutMs ?? process.env.ALAWAEL_SEND_TIMEOUT_MS,
      DEFAULT_SEND_TIMEOUT_MS
    )
    this.clientRefParam =
      config.clientRefParam ?? process.env.ALAWAEL_CLIENT_REF_PARAM ?? ""
    this.fetchFn = opts.fetchFn ?? (globalThis.fetch as FetchLike)
  }

  async send(
    to: string,
    body: string,
    opts: SmsSendOptions = {}
  ): Promise<SmsResult> {
    const parts = breakMessageIntoParts(body)
    const ids: string[] = []
    for (const [index, part] of parts.entries()) {
      const ref =
        opts.clientRef && parts.length > 1
          ? `${opts.clientRef}-${index + 1}`
          : opts.clientRef
      const result = await this.sendPart(to, part, ref)
      if (!result.ok)
        return index > 0 ? { ...result, partsSent: index } : result
      if (result.id) ids.push(result.id)
    }
    return { ok: true, messageId: ids.join(",") }
  }

  async lookupStatus(): Promise<SmsStatusLookup> {
    return "unsupported"
  }

  private fail(
    outcome: "failed" | "ambiguous",
    error: string
  ): FailedSmsResult {
    return {
      ok: false,
      outcome,
      error: redact(error.replace(/https?:\/\/\S+/gi, "[url]"), this.password),
    }
  }

  private async sendPart(
    to: string,
    part: string,
    clientRef: string | undefined
  ): Promise<FailedSmsResult | { ok: true; id: string | null }> {
    const controller = new AbortController()
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.sendTimeoutMs)
    try {
      const url = new URL(this.sendUrl)
      url.searchParams.set("orgName", this.orgName)
      url.searchParams.set("userName", this.username)
      url.searchParams.set("password", this.password)
      url.searchParams.set("mobileNo", to)
      url.searchParams.set("text", part)
      url.searchParams.set("coding", String(this.coding))
      if (this.clientRefParam && clientRef)
        url.searchParams.set(this.clientRefParam, clientRef)
      const res = await this.fetchFn(url.toString(), {
        signal: controller.signal,
      })
      const text = await res.text()
      if (res.status >= 500)
        return this.fail(
          "ambiguous",
          `خطأ من مزود الخدمة (HTTP ${res.status})، ${AMBIGUOUS_SUFFIX}`
        )
      const parsed = parseSmsResponse(text)
      if (parsed.kind === "empty")
        return this.fail("ambiguous", `رد فارغ من المزود، ${AMBIGUOUS_SUFFIX}`)
      if (parsed.kind === "invalid")
        return this.fail(
          "ambiguous",
          `رد غير مفهوم من المزود، ${AMBIGUOUS_SUFFIX}: ${parsed.raw.slice(0, 200)}`
        )
      if (parsed.code !== SUCCESS_CODE)
        return this.fail("failed", parsed.message.trim() || text.trim())
      return { ok: true, id: parsed.id }
    } catch (err) {
      return this.classifyThrown(err, timedOut)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private classifyThrown(err: unknown, timedOut: boolean): FailedSmsResult {
    if (timedOut)
      return this.fail(
        "ambiguous",
        `انتهت مهلة انتظار رد المزود، ${AMBIGUOUS_SUFFIX}`
      )
    const code = errorCode(err)
    const detail = errorDetail(err)
    const preSend =
      (code !== undefined && PRE_SEND_ERROR_CODES.has(code)) ||
      (err instanceof TypeError && /invalid url/i.test(err.message))
    if (preSend)
      return this.fail("failed", `تعذر الاتصال بمزود الرسائل: ${detail}`)
    return this.fail(
      "ambiguous",
      `انقطع الاتصال بمزود الرسائل، ${AMBIGUOUS_SUFFIX}: ${detail}`
    )
  }

  async getBalance(): Promise<string> {
    if (!this.balanceUrl)
      throw new Error("ALAWAEL_BALANCE_URL is not configured")
    if (!this.balanceUrl.startsWith("https://"))
      throw new Error("ALAWAEL_BALANCE_URL must use HTTPS")
    const url = new URL(this.balanceUrl)
    url.searchParams.set("O", this.orgName)
    url.searchParams.set("U", this.username)
    url.searchParams.set("P", this.password)
    let body: string
    try {
      const res = await this.fetchFn(url.toString())
      body = (await res.text()).trim()
    } catch (err) {
      throw new Error(redact(errorDetail(err), this.password))
    }
    if (!body)
      throw new Error("Empty response received while checking balance.")
    return body
  }
}

const ALAWAEL_ENV_NAMES = [
  "ALAWAEL_ORG_NAME",
  "ALAWAEL_USERNAME",
  "ALAWAEL_PASSWORD",
] as const

function alawaelConfigFromEnv(): AlawaelConfig | null {
  const [orgName, username, password] = ALAWAEL_ENV_NAMES.map(
    (name) => process.env[name]
  )
  if (!orgName || !username || !password) return null
  const coding = Number(process.env.ALAWAEL_CODING ?? DEFAULT_CODING)
  return {
    orgName,
    username,
    password,
    sendUrl: process.env.ALAWAEL_SEND_URL,
    balanceUrl: process.env.ALAWAEL_BALANCE_URL,
    coding: Number.isNaN(coding) ? DEFAULT_CODING : coding,
    connectTimeoutMs: positiveInt(
      process.env.ALAWAEL_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS
    ),
    sendTimeoutMs: positiveInt(
      process.env.ALAWAEL_SEND_TIMEOUT_MS,
      DEFAULT_SEND_TIMEOUT_MS
    ),
  }
}

let currentGateway: SmsGateway | null = null

export function getSmsGateway(): SmsGateway {
  if (currentGateway) return currentGateway
  const alawael = alawaelConfigFromEnv()
  if (alawael) {
    currentGateway = new AlawaelSmsGateway(alawael)
    return currentGateway
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SMS_ALLOW_FAKE !== "1"
  ) {
    const missing = ALAWAEL_ENV_NAMES.filter((name) => !process.env[name])
    throw new Error(
      `SMS gateway is not configured: missing ${missing.join(", ")}`
    )
  }
  const failRate = Number(process.env.SMS_FAIL_RATE ?? "0")
  currentGateway = new FakeSmsGateway({
    failRate: Number.isNaN(failRate) ? 0 : failRate,
  })
  return currentGateway
}

export function setSmsGateway(gateway: SmsGateway): void {
  currentGateway = gateway
}
