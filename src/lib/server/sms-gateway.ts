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

let currentGateway: SmsGateway | null = null

export function getSmsGateway(): SmsGateway {
  if (currentGateway) return currentGateway
  const failRate = Number(process.env.SMS_FAIL_RATE ?? "0")
  currentGateway = new FakeSmsGateway({
    failRate: Number.isNaN(failRate) ? 0 : failRate,
  })
  return currentGateway
}

export function setSmsGateway(gateway: SmsGateway): void {
  currentGateway = gateway
}
