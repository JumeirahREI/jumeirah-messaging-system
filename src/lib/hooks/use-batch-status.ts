"use client"

import useSWR from "swr"

import type { BatchStatusResponse } from "@/lib/server/batch-service"

export function useBatchStatus(batchId: number, status: string) {
  const shouldFetch = status === "sending" || status === "completed"
  const shouldPoll = status === "sending"
  return useSWR<BatchStatusResponse>(
    shouldFetch ? `/api/batches/${batchId}/status` : null,
    {
      refreshInterval: shouldPoll ? 3000 : 0,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 2000,
    }
  )
}
