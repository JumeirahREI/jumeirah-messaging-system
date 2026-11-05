import type { HandlerContext, HandlerEvent, HandlerResponse } from "@netlify/functions"
import { beforeEach, describe, expect, it, vi } from "vitest"

const processPendingMessages = vi.fn()

vi.mock("./batch-processing", () => ({
  processPendingMessages: (...args: unknown[]) =>
    processPendingMessages(...args),
}))

const { handler } = await import(
  "../../../netlify/functions/process-batch-background"
)

const SECRET = "function-secret-value"

async function invoke(
  headers: Record<string, string | undefined>,
  body: unknown
): Promise<HandlerResponse> {
  const event = {
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as HandlerEvent
  return (await handler(event, {} as HandlerContext)) as HandlerResponse
}

beforeEach(() => {
  processPendingMessages.mockReset().mockResolvedValue(undefined)
  vi.stubEnv("NETLIFY_FUNCTION_SECRET", SECRET)
})

describe("process-batch-background handler", () => {
  it("401 without an authorization header", async () => {
    const res = await invoke({}, { batchId: 1 })
    expect(res.statusCode).toBe(401)
    expect(processPendingMessages).not.toHaveBeenCalled()
  })

  it("401 when the secret is unset even with an empty bearer", async () => {
    vi.stubEnv("NETLIFY_FUNCTION_SECRET", "")
    const res = await invoke({ authorization: "Bearer " }, { batchId: 1 })
    expect(res.statusCode).toBe(401)
    expect(processPendingMessages).not.toHaveBeenCalled()
  })

  it("401 for a wrong secret and never echoes the secret", async () => {
    const res = await invoke({ authorization: "Bearer nope" }, { batchId: 1 })
    expect(res.statusCode).toBe(401)
    expect(res.body ?? "").not.toContain(SECRET)
  })

  it.each([1.5, -1, 0, "abc", null, undefined, "1e3"])(
    "400 for invalid batchId %s",
    async (batchId) => {
      const res = await invoke(
        { authorization: `Bearer ${SECRET}` },
        { batchId }
      )
      expect(res.statusCode).toBe(400)
      expect(processPendingMessages).not.toHaveBeenCalled()
    }
  )

  it("400 for a malformed body", async () => {
    const res = await invoke({ authorization: `Bearer ${SECRET}` }, "{nope")
    expect(res.statusCode).toBe(400)
  })

  it("reads headers case-insensitively", async () => {
    const res = await invoke({ Authorization: `Bearer ${SECRET}` }, { batchId: 3 })
    expect(res.statusCode).toBe(200)
  })

  it("200 and processes the batch", async () => {
    const res = await invoke({ authorization: `Bearer ${SECRET}` }, { batchId: 4 })
    expect(res.statusCode).toBe(200)
    expect(processPendingMessages).toHaveBeenCalledWith(4, { hop: 0 })
  })

  it("passes a valid hop through to the engine", async () => {
    const res = await invoke(
      { authorization: `Bearer ${SECRET}` },
      { batchId: 4, hop: 7 }
    )
    expect(res.statusCode).toBe(200)
    expect(processPendingMessages).toHaveBeenCalledWith(4, { hop: 7 })
  })

  it.each([-1, 1.5, "3", "abc", null, {}])(
    "400 for invalid hop %s",
    async (hop) => {
      const res = await invoke(
        { authorization: `Bearer ${SECRET}` },
        { batchId: 4, hop }
      )
      expect(res.statusCode).toBe(400)
      expect(processPendingMessages).not.toHaveBeenCalled()
    }
  )

  it("500 without leaking details when processing throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    processPendingMessages.mockRejectedValue(new Error("db password hunter2"))
    const res = await invoke({ authorization: `Bearer ${SECRET}` }, { batchId: 4 })
    expect(res.statusCode).toBe(500)
    expect(res.body ?? "").not.toContain("hunter2")
  })
})
