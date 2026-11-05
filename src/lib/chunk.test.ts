import { describe, expect, it } from "vitest"
import { chunk, mapChunks } from "./chunk"

describe("chunk", () => {
  it("splits items into groups of at most the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("returns no groups for an empty list", () => {
    expect(chunk([], 3)).toEqual([])
  })

  it("rejects a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})

describe("mapChunks", () => {
  it("runs the callback per chunk in order and flattens the results", async () => {
    const calls: number[][] = []
    const result = await mapChunks([1, 2, 3, 4, 5], 2, async (part) => {
      calls.push(part)
      return part.map((n) => n * 10)
    })
    expect(calls).toEqual([[1, 2], [3, 4], [5]])
    expect(result).toEqual([10, 20, 30, 40, 50])
  })
})
