"use client"

import useSWR from "swr"

import type { BatchStatusResponse } from "@/lib/server/batch-service"

export function useBatchStatus(batchId: number, status: string) {
  const shouldPoll = status === "sending"
  return useSWR<BatchStatusResponse>(
    shouldPoll ? `/api/batches/${batchId}/status` : null,
    {
      refreshInterval: shouldPoll ? 3000 : 0,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 2000,
    }
  )
}
