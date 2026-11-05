import { describe, expect, it } from "vitest"
import { AlawaelSmsGateway } from "@/lib/server/sms-gateway"
import { behaviors, createFakeFetch, ScriptedSmsGateway } from "@/test/sms"

describe("ScriptedSmsGateway", () => {
  it("uses the default behavior and records every call", async () => {
    const gateway = new ScriptedSmsGateway()
    const result = await gateway.send("971500000001", "hello")
    expect(result.ok).toBe(true)
    expect(gateway.calls).toHaveLength(1)
    expect(gateway.calls[0]).toMatchObject({
      to: "971500000001",
      body: "hello",
    })
    expect(typeof gateway.calls[0]?.at).toBe("number")
  })

  it("plays scripted behaviors in order then falls back to the default", async () => {
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.failure("nope"), behaviors.success("id-2")],
      defaultBehavior: behaviors.failure("default"),
    })
    expect(await gateway.send("1", "a")).toEqual({
      ok: false,
      outcome: "failed",
      preSend: false,
      error: "nope",
    })
    expect(await gateway.send("2", "b")).toEqual({
      ok: true,
      messageId: "id-2",
    })
    expect(await gateway.send("3", "c")).toEqual({
      ok: false,
      outcome: "failed",
      preSend: false,
      error: "default",
    })
  })

  it("scripts ambiguous and pre-send outcomes and records startPart", async () => {
    const gateway = new ScriptedSmsGateway({
      script: [
        behaviors.ambiguous("timed out"),
        behaviors.failure("refused", { preSend: true }),
      ],
    })
    expect(await gateway.send("1", "a")).toEqual({
      ok: false,
      outcome: "ambiguous",
      error: "timed out",
    })
    expect(await gateway.send("1", "a", { startPart: 2 })).toEqual({
      ok: false,
      outcome: "failed",
      preSend: true,
      error: "refused",
    })
    expect(gateway.calls[1]?.startPart).toBe(2)
  })

  it("throws when scripted to throw", async () => {
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.throwing("boom")],
    })
    await expect(gateway.send("1", "a")).rejects.toThrow("boom")
    expect(gateway.calls).toHaveLength(1)
  })

  it("delays then resolves with the wrapped behavior", async () => {
    const gateway = new ScriptedSmsGateway({
      script: [behaviors.delay(30, behaviors.success("late"))],
    })
    const start = Date.now()
    const result = await gateway.send("1", "a")
    expect(Date.now() - start).toBeGreaterThanOrEqual(25)
    expect(result).toEqual({ ok: true, messageId: "late" })
  })
})

function gatewayWith(
  fake: ReturnType<typeof createFakeFetch>,
  timeoutMs = 1000
) {
  return new AlawaelSmsGateway(
    {
      orgName: "org",
      username: "user",
      password: "pw",
      sendUrl: "https://sms.test/send",
      sendTimeoutMs: timeoutMs,
    },
    { fetchFn: fake.fetch }
  )
}

describe("createFakeFetch", () => {
  it("serves scripted bodies and records requested urls", async () => {
    const fake = createFakeFetch({ script: [{ body: "0:OK:abc" }] })
    const result = await gatewayWith(fake).send("971500000001", "hi")
    expect(result).toEqual({ ok: true, messageId: "abc" })
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.url).toContain("mobileNo=971500000001")
  })

  it("serves error codes and network errors", async () => {
    const fake = createFakeFetch({
      script: [
        { body: "5:Bad credentials" },
        { error: new Error("ECONNRESET") },
      ],
    })
    const gateway = gatewayWith(fake)
    expect(await gateway.send("1", "a")).toEqual({
      ok: false,
      outcome: "failed",
      preSend: false,
      error: "Bad credentials",
    })
    const reset = await gateway.send("1", "a")
    expect(reset).toMatchObject({ ok: false, outcome: "ambiguous" })
    if (!reset.ok) expect(reset.error).toContain("ECONNRESET")
  })

  it("honours abort signals while delaying", async () => {
    const fake = createFakeFetch({ script: [{ body: "0:OK:x", delayMs: 500 }] })
    const result = await gatewayWith(fake, 20).send("1", "a")
    expect(result.ok).toBe(false)
  })

  it("falls back to a default response", async () => {
    const fake = createFakeFetch({ defaultResponse: { body: "0:OK:def" } })
    expect(await gatewayWith(fake).send("1", "a")).toEqual({
      ok: true,
      messageId: "def",
    })
  })
})
