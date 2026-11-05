import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  authHelpersModule,
  authModule,
  operatorUser,
  resetAuth,
  setTestUser,
} from "@/test/auth"

const dispatchBatchProcessing = vi.fn()
const checkRateLimit = vi.fn()
const batchRows: { current: { status: string }[] } = { current: [] }

vi.mock("@/auth", () => authModule())
vi.mock("@/lib/server/auth-helpers", () => authHelpersModule())
vi.mock("@/lib/server/batch/dispatch", () => ({
  dispatchBatchProcessing: (...args: unknown[]) =>
    dispatchBatchProcessing(...args),
}))
vi.mock("@/lib/server/rate-limit", () => ({
  mutationLimiter: { name: "mutation" },
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))
vi.mock("@/lib/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => batchRows.current }),
      }),
    }),
  },
}))

const { POST } = await import("./route")

const SECRET = "function-secret-value"

function call(
  id: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const req = new Request(`http://localhost:3000/api/batches/${id}/process`, {
    method: "POST",
    headers: { host: "localhost:3000", ...headers },
  })
  return POST(req, { params: Promise.resolve({ id }) })
}

const sameOrigin = { origin: "http://localhost:3000" }

beforeEach(() => {
  dispatchBatchProcessing.mockReset().mockResolvedValue({ ok: true })
  checkRateLimit.mockReset().mockResolvedValue(true)
  batchRows.current = [{ status: "sending" }]
  vi.stubEnv("NETLIFY_FUNCTION_SECRET", SECRET)
  setTestUser(operatorUser())
})

afterEach(() => {
  resetAuth()
})

describe("POST /api/batches/[id]/process", () => {
  it.each(["1.5", "-1", "0", "abc", "1e3"])("400 for id %s", async (id) => {
    const res = await call(id, sameOrigin)
    expect(res.status).toBe(400)
    expect(dispatchBatchProcessing).not.toHaveBeenCalled()
  })

  it("401 without a session", async () => {
    setTestUser(null)
    const res = await call("1", sameOrigin)
    expect(res.status).toBe(401)
  })

  it("403 when Origin is absent and no bearer is given", async () => {
    const res = await call("1")
    expect(res.status).toBe(403)
    expect(dispatchBatchProcessing).not.toHaveBeenCalled()
  })

  it("403 when Origin is absent and the bearer is wrong or the secret is unset", async () => {
    expect((await call("1", { authorization: "Bearer wrong" })).status).toBe(403)
    vi.stubEnv("NETLIFY_FUNCTION_SECRET", "")
    expect((await call("1", { authorization: "Bearer " })).status).toBe(403)
  })

  it("403 for a foreign Origin", async () => {
    const res = await call("1", { origin: "https://evil.example" })
    expect(res.status).toBe(403)
  })

  it("accepts a valid bearer without an Origin", async () => {
    const res = await call("1", { authorization: `Bearer ${SECRET}` })
    expect(res.status).toBe(202)
  })

  it("429 when rate limited", async () => {
    checkRateLimit.mockResolvedValue(false)
    const res = await call("1", sameOrigin)
    expect(res.status).toBe(429)
    expect(dispatchBatchProcessing).not.toHaveBeenCalled()
  })

  it("rate limits per user with the mutation limiter", async () => {
    await call("1", sameOrigin)
    expect(checkRateLimit).toHaveBeenCalledWith(
      { name: "mutation" },
      expect.stringContaining(String(operatorUser().id))
    )
  })

  it("404 for an unknown batch", async () => {
    batchRows.current = []
    const res = await call("99", sameOrigin)
    expect(res.status).toBe(404)
  })

  it.each(["draft", "completed", "paused"])("409 when status is %s", async (status) => {
    batchRows.current = [{ status }]
    const res = await call("1", sameOrigin)
    expect(res.status).toBe(409)
    expect(dispatchBatchProcessing).not.toHaveBeenCalled()
  })

  it("202 and starts processing for a sending batch", async () => {
    const res = await call("7", sameOrigin)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true, batchId: 7 })
    expect(dispatchBatchProcessing).toHaveBeenCalledWith(7)
  })

  it("502 and no state change when the dispatch is rejected", async () => {
    dispatchBatchProcessing.mockResolvedValue({
      ok: false,
      status: 500,
      error: "nope",
    })
    const res = await call("7", sameOrigin)
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain("nope")
  })

  it("502 when the dispatch throws", async () => {
    dispatchBatchProcessing.mockRejectedValue(new Error("net"))
    const res = await call("7", sameOrigin)
    expect(res.status).toBe(502)
  })
})
