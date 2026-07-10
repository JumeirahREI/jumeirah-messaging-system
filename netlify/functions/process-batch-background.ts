import type { Handler } from "@netlify/functions"

import { processPendingMessages } from "../../src/lib/server/batch-processing"

export const handler: Handler = async (event) => {
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
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: e instanceof Error ? e.message : "خطأ في المعالجة",
      }),
    }
  }
}
