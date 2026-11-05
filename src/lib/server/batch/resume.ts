export interface ResumeResult {
  reaped: number
  dispatched: number[]
  failed: Array<{ batchId: number; error: string }>
}
export const resumeStalledBatches = async (
  _deps: Record<string, unknown> = {}
): Promise<ResumeResult> => ({ reaped: 0, dispatched: [], failed: [] })
