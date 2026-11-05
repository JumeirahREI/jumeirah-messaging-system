import { processPendingMessages } from "@/lib/server/batch-processing"

export function invokeBackgroundProcess(batchId: number): void {
  const isNetlify = Boolean(process.env.NETLIFY)
  const url = isNetlify
    ? `/.netlify/functions/process-batch-background`
    : `http://localhost:3000/api/batches/${batchId}/process`
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  const functionSecret = process.env.NETLIFY_FUNCTION_SECRET
  if (isNetlify && functionSecret) {
    headers["authorization"] = `Bearer ${functionSecret}`
  }
  void fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ batchId }),
  }).catch((err) => {
    console.error(`[invokeBackgroundProcess] fetch failed`, err)
    void processPendingMessages(batchId).catch((e) =>
      console.error(`[invokeBackgroundProcess] fallback failed`, e)
    )
  })
}

export const dispatchBatchProcessing = async (
  ..._args: unknown[]
): Promise<{ ok: boolean; status?: number; error?: string }> => ({ ok: false })
