import { describe, expect, it, vi } from "vitest"

import {
  AlawaelSmsGateway,
  breakMessageIntoParts,
  FakeSmsGateway,
  setSmsGateway,
  type FetchLike,
} from "./sms-gateway"

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

const baseConfig = {
  orgName: "ORG",
  username: "user",
  password: "pass",
}

function mockFetch(body: string, status = 200) {
  return vi.fn(async (_input: string) => new Response(body, { status }))
}

describe("breakMessageIntoParts", () => {
  it("returns single part when within limit", () => {
    expect(breakMessageIntoParts("short")).toEqual(["short"])
  })

  it("splits long message at sentence boundary", () => {
    const long =
      "A".repeat(300) + ". " + "B".repeat(300) + ". " + "C".repeat(100)
    const parts = breakMessageIntoParts(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join("")).toBe(long)
  })

  it("splits at space when no sentence boundary in window", () => {
    const long = "word ".repeat(80) + "tail"
    const parts = breakMessageIntoParts(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join("")).toBe(long)
  })

  it("handles unicode (arabic) by character count not bytes", () => {
    const arabic = "مرحبا ".repeat(70) + "نهاية"
    const parts = breakMessageIntoParts(arabic)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join("")).toBe(arabic)
  })
})

describe("AlawaelSmsGateway", () => {
  it("throws on missing required creds", () => {
    expect(
      () => new AlawaelSmsGateway({ orgName: "", username: "", password: "" })
    ).toThrow()
  })

  it("returns ok with messageId on success response", async () => {
    const fetchFn = mockFetch(
      "0:Message Submitted:12345"
    ) as unknown as FetchLike
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn })
    const res = await gw.send("967777000111", "hello")
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.messageId).toBe("12345")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("returns failure with provider message on error code", async () => {
    const fetchFn = mockFetch("1001:Invalid Login") as unknown as FetchLike
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn })
    const res = await gw.send("967777000111", "hello")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("Invalid Login")
  })

  it("returns failure on malformed response", async () => {
    const fetchFn = mockFetch("garbage") as unknown as FetchLike
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn })
    const res = await gw.send("967777000111", "hello")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("garbage")
  })

  it("returns failure on network error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("connection refused")
    }) as unknown as FetchLike
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn })
    const res = await gw.send("967777000111", "hello")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("connection refused")
  })

  it("sends multipart message and joins ids", async () => {
    const mock = vi.fn(async () => new Response("0:ok:part1", { status: 200 }))
    const gw = new AlawaelSmsGateway(baseConfig, {
      fetchFn: mock as unknown as FetchLike,
    })
    const long = "A".repeat(300) + ". " + "B".repeat(100)
    const res = await gw.send("967777000111", long)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.messageId).toBe("part1,part1")
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it("fails the whole send if any part fails", async () => {
    const fetchFn = vi.fn(
      async () => new Response("1001:Invalid Login", { status: 200 })
    ) as unknown as FetchLike
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn })
    const long = "A".repeat(300) + ". " + "B".repeat(100)
    const res = await gw.send("967777000111", long)
    expect(res.ok).toBe(false)
  })

  it("passes orgName/userName/password/mobileNo/text/coding as query params", async () => {
    const mock = mockFetch("0:ok:1")
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, coding: 2 },
      { fetchFn: mock as unknown as FetchLike }
    )
    await gw.send("967777000111", "hi")
    const url = (mock.mock.calls[0]?.[0] as string) ?? ""
    expect(url).toContain("orgName=ORG")
    expect(url).toContain("userName=user")
    expect(url).toContain("password=pass")
    expect(url).toContain("mobileNo=967777000111")
    expect(url).toContain("text=hi")
    expect(url).toContain("coding=2")
  })

  it("getBalance returns trimmed balance body", async () => {
    const fetchFn = mockFetch("  1234.56  ") as unknown as FetchLike
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, balanceUrl: "https://balance.example/AlawaelEstalam" },
      { fetchFn }
    )
    expect(await gw.getBalance()).toBe("1234.56")
  })
})
