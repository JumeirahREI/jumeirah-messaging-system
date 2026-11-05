import { describe, expect, it } from "vitest"

import { AdaptiveConcurrency } from "./adaptive-concurrency"

const make = (over: Partial<ConstructorParameters<typeof AdaptiveConcurrency>[0]> = {}) =>
  new AdaptiveConcurrency({ initial: 10, min: 1, max: 20, ...over })

function feed(
  c: AdaptiveConcurrency,
  n: number,
  sample: { latencyMs: number; ambiguous?: boolean }
) {
  for (let i = 0; i < n; i++)
    c.record({ latencyMs: sample.latencyMs, ambiguous: sample.ambiguous ?? false })
}

describe("AdaptiveConcurrency", () => {
  it("starts at the initial limit clamped into [min, max]", () => {
    expect(make().limit).toBe(10)
    expect(make({ initial: 99 }).limit).toBe(20)
    expect(make({ initial: 0 }).limit).toBe(1)
  })

  it("does not change before enough samples", () => {
    const c = make({ minSamples: 10 })
    feed(c, 5, { latencyMs: 60_000 })
    expect(c.limit).toBe(10)
  })

  it("shrinks multiplicatively when p95 latency is high", () => {
    const c = make({ highLatencyMs: 10_000, minSamples: 10 })
    feed(c, 10, { latencyMs: 30_000 })
    expect(c.limit).toBe(5)
  })

  it("shrinks when the ambiguous rate crosses the threshold", () => {
    const c = make({ ambiguousRateThreshold: 0.2, minSamples: 10 })
    for (let i = 0; i < 10; i++)
      c.record({ latencyMs: 100, ambiguous: i % 2 === 0 })
    expect(c.limit).toBe(5)
  })

  it("a single slow outlier does not shrink the pool (p95 of a healthy window)", () => {
    const c = make({ highLatencyMs: 10_000, minSamples: 20, window: 100 })
    feed(c, 99, { latencyMs: 200 })
    c.record({ latencyMs: 60_000, ambiguous: false })
    expect(c.limit).toBeGreaterThanOrEqual(10)
  })

  it("never goes below min", () => {
    const c = make({ highLatencyMs: 1000, minSamples: 5, initial: 2 })
    for (let i = 0; i < 10; i++) feed(c, 5, { latencyMs: 50_000 })
    expect(c.limit).toBe(1)
  })

  it("grows slowly by one when healthy and never above max", () => {
    const c = make({ initial: 10, growEvery: 10, minSamples: 1 })
    feed(c, 9, { latencyMs: 100 })
    expect(c.limit).toBe(10)
    feed(c, 1, { latencyMs: 100 })
    expect(c.limit).toBe(11)
    feed(c, 1000, { latencyMs: 100 })
    expect(c.limit).toBe(20)
  })

  it("recovers after a shrink once the gateway is healthy again", () => {
    const c = make({
      highLatencyMs: 10_000,
      minSamples: 10,
      growEvery: 10,
      window: 20,
    })
    feed(c, 10, { latencyMs: 30_000 })
    const shrunk = c.limit
    expect(shrunk).toBeLessThan(10)
    feed(c, 200, { latencyMs: 100 })
    expect(c.limit).toBeGreaterThan(shrunk)
    expect(c.limit).toBeLessThanOrEqual(20)
  })

  it("does not grow while the ambiguous rate is elevated but under the shrink threshold", () => {
    const c = make({
      ambiguousRateThreshold: 0.2,
      minSamples: 10,
      growEvery: 5,
      window: 20,
    })
    for (let i = 0; i < 60; i++)
      c.record({ latencyMs: 100, ambiguous: i % 8 === 0 })
    expect(c.limit).toBe(10)
  })
})
