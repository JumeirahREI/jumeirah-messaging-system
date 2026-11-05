const FUNCTION_PATH = "/.netlify/functions/process-batch-background"
const DEFAULT_DISPATCH_TIMEOUT_MS = 15_000

export interface DispatchOptions {
  hop?: number
}

export interface DispatchResult {
  ok: boolean
  status?: number
  error?: string
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export interface DispatchDeps {
  fetchFn?: FetchFn
  processLocal?: (batchId: number, opts: { hop: number }) => Promise<unknown>
  timeoutMs?: number
}

function baseUrl(): string | undefined {
  const raw =
    process.env.URL ||
    process.env.DEPLOY_URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.APP_URL
  return raw ? raw.replace(/\/+$/, "") : undefined
}

async function defaultProcessLocal(batchId: number, opts: { hop: number }) {
  const { processPendingMessages } = await import(
    "@/lib/server/batch-processing"
  )
  return processPendingMessages(batchId, { hop: opts.hop })
}

async function dispatchToFunction(
  batchId: number,
  hop: number,
  deps: DispatchDeps
): Promise<DispatchResult> {
  const secret = process.env.NETLIFY_FUNCTION_SECRET
  if (!secret?.trim())
    return { ok: false, error: "NETLIFY_FUNCTION_SECRET is not configured" }
  const base = baseUrl()
  if (!base)
    return { ok: false, error: "No absolute site URL (URL/DEPLOY_URL/APP_URL)" }

  const fetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init))
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS
  )
  try {
    const res = await fetchFn(`${base}${FUNCTION_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ batchId, hop }),
      signal: controller.signal,
    })
    if (res.status >= 200 && res.status < 300)
      return { ok: true, status: res.status }
    return {
      ok: false,
      status: res.status,
      error: `Dispatch rejected with HTTP ${res.status}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message.split(secret).join("[redacted]") }
  } finally {
    clearTimeout(timer)
  }
}

export async function dispatchBatchProcessing(
  batchId: number,
  opts: DispatchOptions = {},
  deps: DispatchDeps = {}
): Promise<DispatchResult> {
  const hop = opts.hop ?? 0
  if (process.env.NETLIFY) return dispatchToFunction(batchId, hop, deps)

  const processLocal = deps.processLocal ?? defaultProcessLocal
  void Promise.resolve()
    .then(() => processLocal(batchId, { hop }))
    .catch((err) =>
      console.error(`[dispatchBatchProcessing] batch ${batchId} failed`, err)
    )
  return { ok: true }
}

export function invokeBackgroundProcess(batchId: number): void {
  void dispatchBatchProcessing(batchId)
    .then((res) => {
      if (!res.ok)
        console.error(
          `[invokeBackgroundProcess] batch ${batchId} dispatch failed: ${res.error ?? res.status}`
        )
    })
    .catch((err) =>
      console.error(`[invokeBackgroundProcess] batch ${batchId} threw`, err)
    )
}
