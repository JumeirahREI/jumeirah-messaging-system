import { describe, expect, it, vi } from "vitest"

import { FakeSmsGateway, setSmsGateway } from "./sms-gateway"

describe("FakeSmsGateway", () => {
  it("returns ok with a fake messageId by default", async () => {
    const gw = new FakeSmsGateway()
    const res = await gw.send("967777111222", "مرحبا")
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.messageId).toMatch(/^fake-\d+-\d+$/)
    }
  })

  it("logs to console without throwing", async () => {
    const gw = new FakeSmsGateway()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    await gw.send("967777000111", "test body")
    expect(logSpy).toHaveBeenCalled()
    expect(logSpy.mock.calls[0]?.[0]).toContain("[FakeSms]")
    logSpy.mockRestore()
  })

  it("simulates failure when failRate is 1", async () => {
    const gw = new FakeSmsGateway({ failRate: 1 })
    const res = await gw.send("967777000111", "body")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("محاكاة فشل الإرسال")
    }
  })

  it("always succeeds when failRate is 0", async () => {
    const gw = new FakeSmsGateway({ failRate: 0 })
    for (let i = 0; i < 20; i++) {
      const res = await gw.send("967777000111", `body ${i}`)
      expect(res.ok).toBe(true)
    }
  })

  it("produces unique messageIds across calls", async () => {
    const gw = new FakeSmsGateway()
    const ids = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const res = await gw.send("967777000111", "body")
      if (res.ok) ids.add(res.messageId)
    }
    expect(ids.size).toBe(10)
  })

  it("setSmsGateway replaces the active gateway", async () => {
    const fake = new FakeSmsGateway({ failRate: 1 })
    setSmsGateway(fake)
    const { getSmsGateway } = await import("./sms-gateway")
    const active = getSmsGateway()
    const res = await active.send("967777000111", "body")
    expect(res.ok).toBe(false)
    setSmsGateway(new FakeSmsGateway())
  })
})
