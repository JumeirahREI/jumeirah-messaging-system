import type { Config, Handler } from "@netlify/functions"

import { processPendingMessages } from "../../src/lib/server/batch-processing"

export const config: Config = {
  background: true,
}

export const handler: Handler = async (event) => {
  const authHeader = event.headers["authorization"] ?? ""
  const expected = `Bearer ${process.env.NETLIFY_FUNCTION_SECRET ?? ""}`
  if (!expected || authHeader !== expected) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "غير مصرح" }),
    }
  }
  try {
    const body = JSON.parse(event.body ?? "{}")
    const batchId = Number(body.batchId)
    if (Number.isNaN(batchId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "معرّف غير صالح" }),
      }
    }
    await processPendingMessages(batchId)
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, batchId }),
    }
  } catch (err) {
    console.error("[process-batch-background] failed", err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "خطأ في المعالجة" }),
    }
  }
}
