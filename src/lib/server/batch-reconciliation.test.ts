import { describe, expect, it } from "vitest"

import { computeReconciliation } from "./batch-reconciliation"

describe("computeReconciliation", () => {
  it("returns empty unmatched/missing when Excel and DB match exactly", () => {
    const excel = ["A101", "A102", "B201"]
    const db = [
      { label: "A101", towerLabel: "Tower A" },
      { label: "A102", towerLabel: "Tower A" },
      { label: "B201", towerLabel: "Tower B" },
    ]
    const result = computeReconciliation(excel, db)
    expect(result.unmatched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.coverage).toEqual({ matched: 3, total: 3 })
  })

  it("identifies Excel labels not in DB (unmatched)", () => {
    const excel = ["A101", "X999", "Y888"]
    const db = [
      { label: "A101", towerLabel: "Tower A" },
      { label: "A102", towerLabel: "Tower A" },
    ]
    const result = computeReconciliation(excel, db)
    expect(result.unmatched).toEqual(["X999", "Y888"])
    expect(result.missing).toEqual([
      { label: "A102", towerLabel: "Tower A" },
    ])
    expect(result.coverage).toEqual({ matched: 1, total: 2 })
  })

  it("identifies DB apartments not in Excel (missing)", () => {
    const excel = ["A101"]
    const db = [
      { label: "A101", towerLabel: "Tower A" },
      { label: "A102", towerLabel: "Tower A" },
      { label: "B201", towerLabel: "Tower B" },
    ]
    const result = computeReconciliation(excel, db)
    expect(result.unmatched).toEqual([])
    expect(result.missing).toEqual([
      { label: "A102", towerLabel: "Tower A" },
      { label: "B201", towerLabel: "Tower B" },
    ])
    expect(result.coverage).toEqual({ matched: 1, total: 3 })
  })

  it("handles empty Excel labels", () => {
    const excel: string[] = []
    const db = [
      { label: "A101", towerLabel: "Tower A" },
      { label: "A102", towerLabel: "Tower A" },
    ]
    const result = computeReconciliation(excel, db)
    expect(result.unmatched).toEqual([])
    expect(result.missing).toEqual([
      { label: "A101", towerLabel: "Tower A" },
      { label: "A102", towerLabel: "Tower A" },
    ])
    expect(result.coverage).toEqual({ matched: 0, total: 2 })
  })

  it("handles empty DB apartments", () => {
    const excel = ["A101", "A102"]
    const db: Array<{ label: string; towerLabel: string }> = []
    const result = computeReconciliation(excel, db)
    expect(result.unmatched).toEqual(["A101", "A102"])
    expect(result.missing).toEqual([])
    expect(result.coverage).toEqual({ matched: 0, total: 0 })
  })

  it("handles both empty", () => {
    const result = computeReconciliation([], [])
    expect(result.unmatched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.coverage).toEqual({ matched: 0, total: 0 })
  })

  it("handles duplicate Excel labels", () => {
    const excel = ["A101", "A101", "A102"]
    const db = [
      { label: "A101", towerLabel: "Tower A" },
      { label: "A102", towerLabel: "Tower A" },
    ]
    const result = computeReconciliation(excel, db)
    expect(result.unmatched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.coverage).toEqual({ matched: 2, total: 2 })
  })

  it("preserves tower label in missing entries", () => {
    const excel = ["A101"]
    const db = [
      { label: "A101", towerLabel: "Tower A" },
      { label: "C301", towerLabel: "Tower C" },
    ]
    const result = computeReconciliation(excel, db)
    expect(result.missing).toEqual([
      { label: "C301", towerLabel: "Tower C" },
    ])
  })
})
