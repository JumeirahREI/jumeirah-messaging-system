import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dispatchBatchProcessing, invokeBackgroundProcess } from "./dispatch"

const SECRET = "function-secret-value"

type FetchArgs = [string, RequestInit]

function netlifyEnv(extra: Record<string, string> = {}) {
  vi.stubEnv("NETLIFY", "true")
  vi.stubEnv("NETLIFY_FUNCTION_SECRET", SECRET)
  vi.stubEnv("URL", "https://site.example.app")
  vi.stubEnv("DEPLOY_URL", "")
  vi.stubEnv("DEPLOY_PRIME_URL", "")
  vi.stubEnv("APP_URL", "")
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v)
}

function localEnv() {
  vi.stubEnv("NETLIFY", "")
  vi.stubEnv("NETLIFY_FUNCTION_SECRET", "")
}

const okFetch = () =>
  vi.fn(async (..._a: FetchArgs) => new Response(null, { status: 202 }))

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("dispatchBatchProcessing on Netlify", () => {
  it("posts to an absolute function URL with bearer auth and { batchId, hop }", async () => {
    netlifyEnv()
    const fetchFn = okFetch()
    const processLocal = vi.fn()
    const res = await dispatchBatchProcessing(
      7,
      { hop: 3 },
      { fetchFn, processLocal }
    )
    expect(res).toEqual({ ok: true, status: 202 })
    const [url, init] = fetchFn.mock.calls[0] as FetchArgs
    expect(url).toBe(
      "https://site.example.app/.netlify/functions/process-batch-background"
    )
    expect(init.method).toBe("POST")
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe(`Bearer ${SECRET}`)
    expect(JSON.parse(String(init.body))).toEqual({ batchId: 7, hop: 3 })
    expect(processLocal).not.toHaveBeenCalled()
  })

  it("defaults hop to 0", async () => {
    netlifyEnv()
    const fetchFn = okFetch()
    await dispatchBatchProcessing(7, undefined, { fetchFn })
    expect(JSON.parse(String((fetchFn.mock.calls[0] as FetchArgs)[1].body))).toEqual(
      { batchId: 7, hop: 0 }
    )
  })

  it.each([
    ["DEPLOY_URL", { URL: "" }, { DEPLOY_URL: "https://deploy.example" }],
    [
      "DEPLOY_PRIME_URL",
      { URL: "", DEPLOY_URL: "" },
      { DEPLOY_PRIME_URL: "https://prime.example" },
    ],
    [
      "APP_URL",
      { URL: "", DEPLOY_URL: "", DEPLOY_PRIME_URL: "" },
      { APP_URL: "https://app.example" },
    ],
  ])("falls back to %s for the base URL", async (_name, clear, set) => {
    netlifyEnv(clear)
    for (const [k, v] of Object.entries(set)) vi.stubEnv(k, v)
    const fetchFn = okFetch()
    await dispatchBatchProcessing(1, undefined, { fetchFn })
    const url = (fetchFn.mock.calls[0] as FetchArgs)[0]
    expect(url).toBe(
      `${Object.values(set)[0]}/.netlify/functions/process-batch-background`
    )
  })

  it("strips a trailing slash from the base URL", async () => {
    netlifyEnv({ URL: "https://site.example.app/" })
    const fetchFn = okFetch()
    await dispatchBatchProcessing(1, undefined, { fetchFn })
    expect((fetchFn.mock.calls[0] as FetchArgs)[0]).toBe(
      "https://site.example.app/.netlify/functions/process-batch-background"
    )
  })

  it("fails closed without NETLIFY_FUNCTION_SECRET and sends nothing", async () => {
    netlifyEnv({ NETLIFY_FUNCTION_SECRET: "" })
    const fetchFn = okFetch()
    const processLocal = vi.fn()
    const res = await dispatchBatchProcessing(1, undefined, {
      fetchFn,
      processLocal,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(processLocal).not.toHaveBeenCalled()
  })

  it("fails when no absolute base URL is available", async () => {
    netlifyEnv({ URL: "" })
    const fetchFn = okFetch()
    const res = await dispatchBatchProcessing(1, undefined, { fetchFn })
    expect(res.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("surfaces a non-2xx status and does not process in-process", async () => {
    netlifyEnv()
    const fetchFn = vi.fn(async () => new Response("no", { status: 500 }))
    const processLocal = vi.fn()
    const res = await dispatchBatchProcessing(1, undefined, {
      fetchFn,
      processLocal,
    })
    expect(res).toMatchObject({ ok: false, status: 500 })
    expect(processLocal).not.toHaveBeenCalled()
  })

  it("surfaces a network error without leaking the secret", async () => {
    netlifyEnv()
    const fetchFn = vi.fn(async () => {
      throw new Error(`connect failed, auth ${SECRET}`)
    })
    const processLocal = vi.fn()
    const res = await dispatchBatchProcessing(1, undefined, {
      fetchFn,
      processLocal,
    })
    expect(res.ok).toBe(false)
    expect(res.error).not.toContain(SECRET)
    expect(processLocal).not.toHaveBeenCalled()
  })

  it("aborts a hung dispatch after the timeout", async () => {
    netlifyEnv()
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          )
        })
    )
    const res = await dispatchBatchProcessing(1, undefined, {
      fetchFn,
      timeoutMs: 20,
    })
    expect(res.ok).toBe(false)
  })
})

describe("dispatchBatchProcessing off Netlify", () => {
  it("runs the injected processor once in-process with the hop and no HTTP", async () => {
    localEnv()
    const fetchFn = okFetch()
    const processLocal = vi.fn(async () => {})
    const res = await dispatchBatchProcessing(
      5,
      { hop: 2 },
      { fetchFn, processLocal }
    )
    expect(res.ok).toBe(true)
    expect(processLocal).toHaveBeenCalledTimes(1)
    expect(processLocal).toHaveBeenCalledWith(5, { hop: 2 })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("does not throw or reject when the local processor fails", async () => {
    localEnv()
    const processLocal = vi.fn(async () => {
      throw new Error("boom")
    })
    const res = await dispatchBatchProcessing(5, undefined, { processLocal })
    expect(res.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(console.error).toHaveBeenCalled()
  })
})

describe("invokeBackgroundProcess (compat)", () => {
  it("is fire-and-forget and logs a failed dispatch without throwing", async () => {
    netlifyEnv()
    const fetchFn = vi.fn(async () => new Response("x", { status: 500 }))
    vi.stubGlobal("fetch", fetchFn)
    expect(invokeBackgroundProcess(9)).toBeUndefined()
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
  })
})
