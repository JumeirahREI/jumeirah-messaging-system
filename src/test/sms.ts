import type { FetchLike, SmsGateway, SmsResult } from "@/lib/server/sms-gateway"

export type SmsBehavior =
  | { kind: "success"; messageId: string }
  | { kind: "failure"; error: string }
  | { kind: "throw"; error: string }
  | { kind: "delay"; ms: number; then: SmsBehavior }

export const behaviors = {
  success: (messageId = "msg-1"): SmsBehavior => ({
    kind: "success",
    messageId,
  }),
  failure: (error = "send failed"): SmsBehavior => ({ kind: "failure", error }),
  throwing: (error = "gateway exploded"): SmsBehavior => ({
    kind: "throw",
    error,
  }),
  delay: (ms: number, then: SmsBehavior = behaviors.success()): SmsBehavior => ({
    kind: "delay",
    ms,
    then,
  }),
}

export interface SmsCall {
  to: string
  body: string
  at: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function play(behavior: SmsBehavior): Promise<SmsResult> {
  switch (behavior.kind) {
    case "success":
      return { ok: true, messageId: behavior.messageId }
    case "failure":
      return { ok: false, error: behavior.error }
    case "throw":
      throw new Error(behavior.error)
    case "delay":
      await sleep(behavior.ms)
      return play(behavior.then)
  }
}

export class ScriptedSmsGateway implements SmsGateway {
  readonly calls: SmsCall[] = []
  private readonly queue: SmsBehavior[]
  private readonly defaultBehavior: SmsBehavior

  constructor(
    opts: { script?: SmsBehavior[]; defaultBehavior?: SmsBehavior } = {}
  ) {
    this.queue = [...(opts.script ?? [])]
    this.defaultBehavior = opts.defaultBehavior ?? behaviors.success()
  }

  enqueue(...scripted: SmsBehavior[]): void {
    this.queue.push(...scripted)
  }

  async send(to: string, body: string): Promise<SmsResult> {
    this.calls.push({ to, body, at: Date.now() })
    return play(this.queue.shift() ?? this.defaultBehavior)
  }
}

export interface FetchResponseScript {
  body?: string
  status?: number
  delayMs?: number
  error?: Error
}

export interface FetchCall {
  url: string
  at: number
}

export interface FakeFetch {
  fetch: FetchLike
  calls: FetchCall[]
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError")
}

function waitUnlessAborted(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true }
    )
  })
}

export function createFakeFetch(
  opts: {
    script?: FetchResponseScript[]
    defaultResponse?: FetchResponseScript
  } = {}
): FakeFetch {
  const queue = [...(opts.script ?? [])]
  const defaultResponse = opts.defaultResponse ?? { body: "0:OK:fake-id" }
  const calls: FetchCall[] = []
  const fetch: FetchLike = async (input, init) => {
    calls.push({ url: input, at: Date.now() })
    const step = queue.shift() ?? defaultResponse
    if (step.delayMs) await waitUnlessAborted(step.delayMs, init?.signal)
    if (step.error) throw step.error
    return new Response(step.body ?? "", { status: step.status ?? 200 })
  }
  return { fetch, calls }
}
