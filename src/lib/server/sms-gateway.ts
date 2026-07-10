export type SmsResult =
  { ok: true; messageId: string } | { ok: false; error: string }

export interface SmsGateway {
  send: (to: string, body: string) => Promise<SmsResult>
}

export class FakeSmsGateway implements SmsGateway {
  private failRate: number

  constructor(opts: { failRate?: number } = {}) {
    this.failRate = opts.failRate ?? 0
  }

  async send(to: string, body: string): Promise<SmsResult> {
    console.log(`[FakeSms] to=${to} body=${body.slice(0, 40)}…`)
    if (this.failRate > 0 && Math.random() < this.failRate) {
      return { ok: false, error: "محاكاة فشل الإرسال" }
    }
    return {
      ok: true,
      messageId: `fake-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    }
  }
}

const DEFAULT_SEND_URL = "https://sms.alawaeltec.com/MainServlet"
const DEFAULT_BALANCE_URL = "http://185.216.203.97:8070/AlawaelEstalam"
const DEFAULT_CODING = 2
const PART_CHAR_LIMIT = 326
const SUCCESS_CODE = 0

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AlawaelConfig {
  orgName: string
  username: string
  password: string
  sendUrl?: string
  balanceUrl?: string
  coding?: number
}

export function breakMessageIntoParts(message: string): string[] {
  const chars = Array.from(message)
  const length = chars.length
  if (length <= PART_CHAR_LIMIT) return [message]

  const parts: string[] = []
  let index = 0
  while (index < length) {
    if (index + PART_CHAR_LIMIT < length) {
      const window = chars.slice(index, index + PART_CHAR_LIMIT)
      const endDot = window.lastIndexOf(".")
      const endColon = window.lastIndexOf(":")
      const endBreak = window.lastIndexOf("\n")
      let endPos = Math.max(endDot, endColon, endBreak)
      if (endPos === -1) endPos = window.lastIndexOf(" ")
      if (endPos === -1) endPos = PART_CHAR_LIMIT - 1
      parts.push(chars.slice(index, index + endPos + 1).join(""))
      index += endPos + 1
    } else {
      parts.push(chars.slice(index).join(""))
      index = length
    }
  }
  return parts
}

interface ParsedSmsResponse {
  code: number
  message: string
  id: string | null
}

function parseSmsResponse(response: string): ParsedSmsResponse {
  const parts = response.split(":")
  if (parts.length < 2) throw new Error(`Invalid response: ${response}`)
  return {
    code: Number(parts[0]),
    message: parts[1] ?? "",
    id: parts[2] ?? null,
  }
}

export class AlawaelSmsGateway implements SmsGateway {
  private readonly orgName: string
  private readonly username: string
  private readonly password: string
  private readonly sendUrl: string
  private readonly balanceUrl: string
  private readonly coding: number
  private readonly fetchFn: FetchLike

  constructor(config: AlawaelConfig, opts: { fetchFn?: FetchLike } = {}) {
    if (!config.orgName || !config.username || !config.password) {
      throw new Error(
        `Missing required Alawael config: ${JSON.stringify({
          orgName: config.orgName || null,
          username: config.username || null,
          password: config.password || null,
        })}`
      )
    }
    this.orgName = config.orgName
    this.username = config.username
    this.password = config.password
    this.sendUrl = config.sendUrl ?? DEFAULT_SEND_URL
    this.balanceUrl = config.balanceUrl ?? DEFAULT_BALANCE_URL
    this.coding = config.coding ?? DEFAULT_CODING
    this.fetchFn = opts.fetchFn ?? (globalThis.fetch as FetchLike)
  }

  async send(to: string, body: string): Promise<SmsResult> {
    const parts = breakMessageIntoParts(body)
    const ids: string[] = []
    for (const part of parts) {
      const url = new URL(this.sendUrl)
      url.searchParams.set("orgName", this.orgName)
      url.searchParams.set("userName", this.username)
      url.searchParams.set("password", this.password)
      url.searchParams.set("mobileNo", to)
      url.searchParams.set("text", part)
      url.searchParams.set("coding", String(this.coding))
      try {
        const res = await this.fetchFn(url.toString())
        const text = await res.text()
        const parsed = parseSmsResponse(text)
        if (parsed.code !== SUCCESS_CODE) {
          return { ok: false, error: parsed.message || text }
        }
        if (parsed.id) ids.push(parsed.id)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    return { ok: true, messageId: ids.join(",") }
  }

  async getBalance(): Promise<string> {
    const url = new URL(this.balanceUrl)
    url.searchParams.set("O", this.orgName)
    url.searchParams.set("U", this.username)
    url.searchParams.set("P", this.password)
    const res = await this.fetchFn(url.toString())
    const body = (await res.text()).trim()
    if (!body)
      throw new Error("Empty response received while checking balance.")
    return body
  }
}

function alawaelConfigFromEnv(): AlawaelConfig | null {
  const orgName = process.env.ALAWAEL_ORG_NAME
  const username = process.env.ALAWAEL_USERNAME
  const password = process.env.ALAWAEL_PASSWORD
  if (!orgName || !username || !password) return null
  const coding = Number(process.env.ALAWAEL_CODING ?? DEFAULT_CODING)
  return {
    orgName,
    username,
    password,
    sendUrl: process.env.ALAWAEL_SEND_URL,
    balanceUrl: process.env.ALAWAEL_BALANCE_URL,
    coding: Number.isNaN(coding) ? DEFAULT_CODING : coding,
  }
}

let currentGateway: SmsGateway | null = null

export function getSmsGateway(): SmsGateway {
  if (currentGateway) return currentGateway
  const alawael = alawaelConfigFromEnv()
  if (alawael) {
    currentGateway = new AlawaelSmsGateway(alawael)
  } else {
    const failRate = Number(process.env.SMS_FAIL_RATE ?? "0")
    currentGateway = new FakeSmsGateway({
      failRate: Number.isNaN(failRate) ? 0 : failRate,
    })
  }
  return currentGateway
}

export function setSmsGateway(gateway: SmsGateway): void {
  currentGateway = gateway
}
