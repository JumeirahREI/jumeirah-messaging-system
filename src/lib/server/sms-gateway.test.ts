import { createServer, type Server } from "node:net"
import type { AddressInfo } from "node:net"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createFakeFetch } from "@/test/sms"

import {
  AlawaelSmsGateway,
  breakMessageIntoParts,
  FakeSmsGateway,
  setSmsGateway,
  type FetchLike,
  type SmsGateway,
  type SmsResult,
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

  it("returns failure when the request times out", async () => {
    const fetchFn = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
    ) as unknown as FetchLike
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, sendTimeoutMs: 1 },
      { fetchFn }
    )
    const res = await gw.send("967777000111", "hello")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.outcome).toBe("ambiguous")
      expect(res.error).toMatch(/[؀-ۿ]/)
    }
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

const SECRET = "Sup3rS3cretPw"
const secretConfig = { orgName: "ORG", username: "user", password: SECRET }
const phone = "967777000111"

function errorWithCode(message: string, code: string): Error {
  const err = new TypeError("fetch failed")
  err.cause = Object.assign(new Error(message), { code })
  return err
}

describe("getSmsGateway factory", () => {
  const alawaelEnv = {
    ALAWAEL_ORG_NAME: "ORG",
    ALAWAEL_USERNAME: "user",
    ALAWAEL_PASSWORD: SECRET,
  }

  async function freshFactory() {
    vi.resetModules()
    return (await import("./sms-gateway")).getSmsGateway
  }

  function clearAlawaelEnv() {
    vi.stubEnv("ALAWAEL_ORG_NAME", "")
    vi.stubEnv("ALAWAEL_USERNAME", "")
    vi.stubEnv("ALAWAEL_PASSWORD", "")
  }

  it("throws in production when credentials are missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("SMS_ALLOW_FAKE", "")
    clearAlawaelEnv()
    const getSmsGateway = await freshFactory()
    expect(() => getSmsGateway()).toThrow(/ALAWAEL_ORG_NAME/)
  })

  it("does not leak a partial password when throwing in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("SMS_ALLOW_FAKE", "")
    clearAlawaelEnv()
    vi.stubEnv("ALAWAEL_PASSWORD", SECRET)
    const getSmsGateway = await freshFactory()
    expect(() => getSmsGateway()).toThrow(/ALAWAEL_USERNAME/)
    expect(() => getSmsGateway()).not.toThrow(new RegExp(SECRET))
  })

  it("allows the fake gateway in production with SMS_ALLOW_FAKE=1", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("SMS_ALLOW_FAKE", "1")
    clearAlawaelEnv()
    const getSmsGateway = await freshFactory()
    expect(() => getSmsGateway()).not.toThrow()
  })

  it("allows the fake gateway outside production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("SMS_ALLOW_FAKE", "")
    clearAlawaelEnv()
    const getSmsGateway = await freshFactory()
    expect(() => getSmsGateway()).not.toThrow()
  })

  it("returns the real gateway in production when configured", async () => {
    vi.stubEnv("NODE_ENV", "production")
    for (const [k, v] of Object.entries(alawaelEnv)) vi.stubEnv(k, v)
    const getSmsGateway = await freshFactory()
    expect(() => getSmsGateway()).not.toThrow()
  })
})

describe("secret hygiene", () => {
  it("missing-username error names fields without values", () => {
    let message = ""
    try {
      new AlawaelSmsGateway({ ...secretConfig, username: "" })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain("username")
    expect(message).not.toContain(SECRET)
  })

  it("fetch error text never contains the password or the URL", async () => {
    const fetchFn: FetchLike = async (input) => {
      throw new Error(`request to ${input} failed, bad ${SECRET}`)
    }
    const gw = new AlawaelSmsGateway(secretConfig, { fetchFn })
    const res = await gw.send(phone, "hello")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).not.toContain(SECRET)
      expect(res.error).not.toMatch(/password=/i)
    }
  })

  it("provider error text echoing the password is redacted", async () => {
    const { fetch } = createFakeFetch({
      defaultResponse: { body: `1001:bad login ${SECRET}` },
    })
    const gw = new AlawaelSmsGateway(secretConfig, { fetchFn: fetch })
    const res = await gw.send(phone, "hello")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).not.toContain(SECRET)
  })

  it("getBalance failures do not leak the password", async () => {
    const fetchFn: FetchLike = async (input) => {
      throw new Error(`failed ${input}`)
    }
    const gw = new AlawaelSmsGateway(
      { ...secretConfig, balanceUrl: "https://balance.example/b" },
      { fetchFn }
    )
    const err = await gw.getBalance().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain(SECRET)
  })
})

describe("response parsing", () => {
  const run = async (body: string, status = 200) => {
    const { fetch } = createFakeFetch({ defaultResponse: { body, status } })
    return new AlawaelSmsGateway(baseConfig, { fetchFn: fetch }).send(
      phone,
      "hi"
    )
  }

  it("parses 0:OK:id as success", async () => {
    expect(await run("0:OK:id-7")).toEqual({ ok: true, messageId: "id-7" })
  })

  it("keeps the whole provider message containing colons", async () => {
    expect(await run("1:err: with: colons")).toMatchObject({
      ok: false,
      outcome: "failed",
      error: "err: with: colons",
    })
  })

  it("treats a non-zero code as a definite failure", async () => {
    expect(await run("1001:Invalid Login")).toMatchObject({
      ok: false,
      outcome: "failed",
    })
  })

  it("treats a non-numeric code as ambiguous", async () => {
    expect(await run("abc:whatever")).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })

  it("treats an empty body as ambiguous", async () => {
    expect(await run("")).toMatchObject({ ok: false, outcome: "ambiguous" })
    expect(await run("   \n")).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })

  it("treats HTTP 502 as ambiguous", async () => {
    expect(await run("Bad Gateway", 502)).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })

  it("treats HTTP 502 as ambiguous even with a parseable error body", async () => {
    expect(await run("1:err", 502)).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })
})

describe("outcome classification of transport errors", () => {
  const sendWith = async (error: Error) => {
    const { fetch } = createFakeFetch({ defaultResponse: { error } })
    return new AlawaelSmsGateway(baseConfig, { fetchFn: fetch }).send(
      phone,
      "hi"
    )
  }

  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])(
    "%s is a definite failure",
    async (code) => {
      expect(await sendWith(errorWithCode(code, code))).toMatchObject({
        ok: false,
        outcome: "failed",
      })
    }
  )

  it("a connect-phase timeout never sent bytes, so it is a definite pre-send failure", async () => {
    const res = await sendWith(
      errorWithCode("Connect Timeout Error", "UND_ERR_CONNECT_TIMEOUT")
    )
    expect(res).toMatchObject({
      ok: false,
      outcome: "failed",
      preSend: true,
    })
  })

  it.each(["ECONNRESET", "UND_ERR_SOCKET"])(
    "%s is ambiguous",
    async (code) => {
      expect(await sendWith(errorWithCode(code, code))).toMatchObject({
        ok: false,
        outcome: "ambiguous",
      })
    }
  )

  it("an unknown thrown error is ambiguous", async () => {
    expect(await sendWith(new Error("something odd"))).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })

  it("an invalid send URL is a definite failure and sends nothing", async () => {
    const { fetch, calls } = createFakeFetch()
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, sendUrl: "https://" },
      { fetchFn: fetch }
    )
    expect(await gw.send(phone, "hi")).toMatchObject({
      ok: false,
      outcome: "failed",
    })
    expect(calls).toHaveLength(0)
  })
})

describe("timeouts", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("a response timeout is ambiguous with an Arabic message", async () => {
    const { fetch } = createFakeFetch({ defaultResponse: { delayMs: 500 } })
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, sendTimeoutMs: 20 },
      { fetchFn: fetch }
    )
    const res = await gw.send(phone, "hi")
    expect(res).toMatchObject({ ok: false, outcome: "ambiguous" })
    if (!res.ok) expect(res.error).toMatch(/[؀-ۿ]/)
  })

  it("a response slower than the old 10s limit succeeds under defaults", async () => {
    vi.useFakeTimers()
    const { fetch } = createFakeFetch({
      defaultResponse: { delayMs: 15_000, body: "0:OK:slow" },
    })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    const pending = gw.send(phone, "hi")
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toEqual({ ok: true, messageId: "slow" })
  })

  it("defaults to a 40s response timeout", async () => {
    vi.useFakeTimers()
    const { fetch } = createFakeFetch({ defaultResponse: { delayMs: 60_000 } })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    const pending = gw.send(phone, "hi")
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(39_000)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(await pending).toMatchObject({ ok: false, outcome: "ambiguous" })
  })

  it("connect timeout does not shorten the response timeout", async () => {
    const { fetch } = createFakeFetch({
      defaultResponse: { delayMs: 80, body: "0:OK:a" },
    })
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, connectTimeoutMs: 10, sendTimeoutMs: 1000 },
      { fetchFn: fetch }
    )
    expect(await gw.send(phone, "hi")).toMatchObject({ ok: true })
  })

  it("response timeout is independent of a long connect timeout", async () => {
    const { fetch } = createFakeFetch({ defaultResponse: { delayMs: 500 } })
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, connectTimeoutMs: 10_000, sendTimeoutMs: 30 },
      { fetchFn: fetch }
    )
    expect(await gw.send(phone, "hi")).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })

  it("falls back to defaults for invalid env values", async () => {
    vi.useFakeTimers()
    vi.stubEnv("ALAWAEL_SEND_TIMEOUT_MS", "abc")
    vi.stubEnv("ALAWAEL_CONNECT_TIMEOUT_MS", "-5")
    const { fetch } = createFakeFetch({
      defaultResponse: { delayMs: 15_000, body: "0:OK:x" },
    })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    const pending = gw.send(phone, "hi")
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toMatchObject({ ok: true })
  })

  it("reads the response timeout from env", async () => {
    vi.stubEnv("ALAWAEL_SEND_TIMEOUT_MS", "20")
    const { fetch } = createFakeFetch({ defaultResponse: { delayMs: 500 } })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    expect(await gw.send(phone, "hi")).toMatchObject({
      ok: false,
      outcome: "ambiguous",
    })
  })
})

describe("multipart sends", () => {
  const long = "A".repeat(300) + ". " + "B".repeat(100)

  it("reports partsSent on a partial failure without resending part 1", async () => {
    const { fetch, calls } = createFakeFetch({
      script: [{ body: "0:OK:p1" }, { body: "1001:Quota exceeded" }],
    })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    const res = await gw.send(phone, long)
    expect(res).toMatchObject({
      ok: false,
      outcome: "failed",
      partsSent: 1,
      error: "Quota exceeded",
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).not.toBe(calls[1]?.url)
  })

  it("reports partsSent when a later part times out", async () => {
    const { fetch } = createFakeFetch({
      script: [{ body: "0:OK:p1" }, { delayMs: 500 }],
    })
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, sendTimeoutMs: 20 },
      { fetchFn: fetch }
    )
    expect(await gw.send(phone, long)).toMatchObject({
      ok: false,
      outcome: "ambiguous",
      partsSent: 1,
    })
  })
})

describe("clientRef and lookupStatus", () => {
  it("does not send a reference parameter by default", async () => {
    const { fetch, calls } = createFakeFetch()
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    await gw.send(phone, "hi", { clientRef: "ref-1" })
    expect(calls[0]?.url).not.toContain("ref-1")
  })

  it("forwards clientRef when ALAWAEL_CLIENT_REF_PARAM names the parameter", async () => {
    vi.stubEnv("ALAWAEL_CLIENT_REF_PARAM", "ref")
    const { fetch, calls } = createFakeFetch()
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    await gw.send(phone, "hi", { clientRef: "ref-1" })
    expect(new URL(calls[0]?.url ?? "").searchParams.get("ref")).toBe("ref-1")
  })

  it("lookupStatus is unsupported for Alawael and the fake gateway", async () => {
    const gateways: SmsGateway[] = [
      new AlawaelSmsGateway(baseConfig),
      new FakeSmsGateway(),
    ]
    for (const gw of gateways)
      expect(await gw.lookupStatus?.("x")).toBe("unsupported")
  })

  it("fake failures are definite", async () => {
    const res = await new FakeSmsGateway({ failRate: 1 }).send(phone, "b")
    expect(res).toMatchObject({ ok: false, outcome: "failed" })
  })
})

describe("breakMessageIntoParts properties", () => {
  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }
  const alphabet = [..."ab. :\nمرحبا😀 ", " ", ".", "\n"]

  it("rejoins, respects the limit, has no empty or tiny parts", () => {
    const rand = rng(42)
    for (let n = 0; n < 200; n++) {
      const len = 327 + Math.floor(rand() * 1500)
      const text = Array.from(
        { length: len },
        () => alphabet[Math.floor(rand() * alphabet.length)]
      ).join("")
      const parts = breakMessageIntoParts(text)
      expect(parts.join("")).toBe(text)
      parts.forEach((p, i) => {
        const size = Array.from(p).length
        expect(size).toBeGreaterThan(0)
        expect(size).toBeLessThanOrEqual(326)
        if (i < parts.length - 1) expect(size).toBeGreaterThanOrEqual(108)
      })
    }
  })

  it("does not split at an early delimiter", () => {
    const text = "Hi." + "x".repeat(600)
    const parts = breakMessageIntoParts(text)
    expect(Array.from(parts[0] ?? "").length).toBeGreaterThan(100)
  })

  it("hard-splits text with no delimiters and terminates", () => {
    const text = "x".repeat(1000)
    const parts = breakMessageIntoParts(text)
    expect(parts.join("")).toBe(text)
    expect(parts.every((p) => p.length <= 326)).toBe(true)
  })

  it("never splits a surrogate pair", () => {
    const text = "😀".repeat(700)
    const parts = breakMessageIntoParts(text)
    expect(parts.join("")).toBe(text)
    for (const p of parts) expect(p).toBe(Array.from(p).join(""))
  })
})

describe("SmsResult contract", () => {
  it("requires outcome on failures (compile-time)", () => {
    // @ts-expect-error outcome is required in the failure branch
    const missingOutcome: SmsResult = { ok: false, error: "x" }
    const definite = {
      ok: false,
      outcome: "failed",
      error: "x",
      preSend: false,
    } satisfies SmsResult
    const ambiguous = {
      ok: false,
      outcome: "ambiguous",
      error: "x",
    } satisfies SmsResult
    expect([missingOutcome, definite, ambiguous]).toHaveLength(3)
  })
})

describe("preSend classification", () => {
  const sendWith = async (error: Error) => {
    const { fetch } = createFakeFetch({ defaultResponse: { error } })
    return new AlawaelSmsGateway(baseConfig, { fetchFn: fetch }).send(
      phone,
      "hi"
    )
  }

  it.each([
    "ENOTFOUND",
    "ECONNREFUSED",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "EAI_AGAIN",
  ])("%s is failed with preSend true", async (code) => {
    expect(await sendWith(errorWithCode(code, code))).toMatchObject({
      ok: false,
      outcome: "failed",
      preSend: true,
    })
  })

  it("an invalid URL is failed with preSend true", async () => {
    const { fetch } = createFakeFetch()
    const gw = new AlawaelSmsGateway(
      { ...baseConfig, sendUrl: "https://" },
      { fetchFn: fetch }
    )
    expect(await gw.send(phone, "hi")).toMatchObject({
      outcome: "failed",
      preSend: true,
    })
  })

  it("a provider error code is failed with preSend false", async () => {
    const { fetch } = createFakeFetch({
      defaultResponse: { body: "1001:Invalid Login" },
    })
    const res = await new AlawaelSmsGateway(baseConfig, {
      fetchFn: fetch,
    }).send(phone, "hi")
    expect(res).toMatchObject({
      ok: false,
      outcome: "failed",
      preSend: false,
    })
  })

  it("the fake gateway failure is failed with preSend false", async () => {
    expect(
      await new FakeSmsGateway({ failRate: 1 }).send(phone, "b")
    ).toMatchObject({ outcome: "failed", preSend: false })
  })

  it("ambiguous results carry no preSend flag", async () => {
    const res = await sendWith(errorWithCode("reset", "ECONNRESET"))
    expect(res).toMatchObject({ outcome: "ambiguous" })
    expect(res).not.toHaveProperty("preSend", true)
  })
})

describe("startPart", () => {
  const long = "A".repeat(300) + ". " + "B".repeat(100)
  const partCount = breakMessageIntoParts(long).length

  it("skips earlier parts and reports cumulative partsSent", async () => {
    const { fetch, calls } = createFakeFetch({
      script: [{ body: "1001:Quota exceeded" }],
    })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    const res = await gw.send(phone, long, { startPart: 2 })
    expect(partCount).toBe(2)
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0]?.url ?? "").searchParams.get("text")).toBe(
      breakMessageIntoParts(long)[1]
    )
    expect(res).toMatchObject({ ok: false, partsSent: 1 })
  })

  it("succeeds when only the remaining parts are sent", async () => {
    const { fetch, calls } = createFakeFetch({
      defaultResponse: { body: "0:OK:p2" },
    })
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    expect(await gw.send(phone, long, { startPart: 2 })).toEqual({
      ok: true,
      messageId: "p2",
    })
    expect(calls).toHaveLength(1)
  })

  it("startPart 1 or undefined sends every part", async () => {
    const { fetch, calls } = createFakeFetch()
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    await gw.send(phone, long, { startPart: 1 })
    expect(calls).toHaveLength(2)
  })

  it("a startPart beyond the last part sends nothing and succeeds", async () => {
    const { fetch, calls } = createFakeFetch()
    const gw = new AlawaelSmsGateway(baseConfig, { fetchFn: fetch })
    expect(await gw.send(phone, long, { startPart: 3 })).toMatchObject({
      ok: true,
    })
    expect(calls).toHaveLength(0)
  })
})

describe("enforced connect timeout (real network stack)", () => {
  let server: Server | undefined
  afterEach(() => {
    server?.close()
    server = undefined
  })

  it("a stalled TLS handshake fails fast as a pre-send failure", async () => {
    const sockets: import("node:net").Socket[] = []
    server = createServer((socket) => {
      sockets.push(socket)
      socket.on("error", () => {})
    })
    await new Promise<void>((r) => server?.listen(0, "127.0.0.1", r))
    const { port } = server.address() as AddressInfo
    const gw = new AlawaelSmsGateway({
      ...baseConfig,
      sendUrl: `https://127.0.0.1:${port}/MainServlet`,
      connectTimeoutMs: 200,
      sendTimeoutMs: 8_000,
    })
    const started = Date.now()
    const res = await gw.send(phone, "hi")
    sockets.forEach((s) => s.destroy())
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(res).toMatchObject({
      ok: false,
      outcome: "failed",
      preSend: true,
    })
  }, 15_000)
})
