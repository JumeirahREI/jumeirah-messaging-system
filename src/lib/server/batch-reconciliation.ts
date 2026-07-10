export type DraftPreviewMissing = {
  label: string
  towerLabel: string
}

export type ReconciliationResult = {
  unmatched: string[]
  missing: DraftPreviewMissing[]
  coverage: { matched: number; total: number }
}

export function computeReconciliation(
  excelLabels: string[],
  dbApartments: Array<{ label: string; towerLabel: string }>
): ReconciliationResult {
  const excelLabelSet = new Set(excelLabels)
  const dbLabels = new Set(dbApartments.map((a) => a.label))
  const unmatched = excelLabels.filter((l) => !dbLabels.has(l))
  const missing: DraftPreviewMissing[] = dbApartments
    .filter((a) => !excelLabelSet.has(a.label))
    .map((a) => ({ label: a.label, towerLabel: a.towerLabel }))
  const coverage = {
    matched: dbApartments.length - missing.length,
    total: dbApartments.length,
  }
  return { unmatched, missing, coverage }
}
