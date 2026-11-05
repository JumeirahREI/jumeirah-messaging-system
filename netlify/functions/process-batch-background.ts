import type { Config, Handler } from "@netlify/functions"

import { processPendingMessages } from "../../src/lib/server/batch-processing"
import { verifyBearer } from "../../src/lib/server/function-auth"
import { parsePositiveInt } from "../../src/lib/server/parse-id"

export const config: Config = {
  background: true,
}

const respond = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  body: JSON.stringify(body),
})

function readHeader(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name)
  return key ? headers[key] : undefined
}

function parseHop(value: unknown): number | null {
  if (value === undefined) return 0
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null
}

function parsePayload(
  body: string | null
): { batchId: number; hop: number } | null {
  try {
    const parsed: unknown = JSON.parse(body ?? "{}")
    if (typeof parsed !== "object" || parsed === null) return null
    const { batchId, hop } = parsed as { batchId?: unknown; hop?: unknown }
    const id = parsePositiveInt(batchId)
    const hopValue = parseHop(hop)
    return id === null || hopValue === null
      ? null
      : { batchId: id, hop: hopValue }
  } catch {
    return null
  }
}

export const handler: Handler = async (event) => {
  const authorized = verifyBearer(
    readHeader(event.headers, "authorization"),
    process.env.NETLIFY_FUNCTION_SECRET
  )
  if (!authorized) return respond(401, { error: "غير مصرح" })

  const payload = parsePayload(event.body)
  if (payload === null) return respond(400, { error: "معرّف غير صالح" })
  const { batchId, hop } = payload

  try {
    await processPendingMessages(batchId, { hop })
    return respond(200, { ok: true, batchId })
  } catch (err) {
    console.error("[process-batch-background] failed", err)
    return respond(500, { error: "خطأ في المعالجة" })
  }
}
