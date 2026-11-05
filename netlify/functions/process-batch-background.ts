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

function parseBatchId(body: string | null): number | null {
  try {
    const parsed: unknown = JSON.parse(body ?? "{}")
    return typeof parsed === "object" && parsed !== null
      ? parsePositiveInt((parsed as { batchId?: unknown }).batchId)
      : null
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

  const batchId = parseBatchId(event.body)
  if (batchId === null) return respond(400, { error: "معرّف غير صالح" })

  try {
    await processPendingMessages(batchId)
    return respond(200, { ok: true, batchId })
  } catch (err) {
    console.error("[process-batch-background] failed", err)
    return respond(500, { error: "خطأ في المعالجة" })
  }
}
