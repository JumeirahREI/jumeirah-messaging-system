export type UnknownResolution = "retry" | "mark_sent" | "mark_failed"

export type ResolveUnknownInput = {
  batchId: number
  messageIds?: number[]
  resolution: UnknownResolution
}

export type ResolveUnknownResult =
  | { ok: true; affected: number }
  | { ok: false; error: string }
