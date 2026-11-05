export interface AdaptiveConcurrencyOptions {
  initial: number
  min?: number
  max: number
  window?: number
  minSamples?: number
  highLatencyMs?: number
  ambiguousRateThreshold?: number
  growEvery?: number
  shrinkFactor?: number
}

export interface Sample {
  latencyMs: number
  ambiguous: boolean
}

export class AdaptiveConcurrency {
  private current: number
  private readonly min: number
  private readonly max: number
  private readonly windowSize: number
  private readonly minSamples: number
  private readonly highLatencyMs: number
  private readonly ambiguousRateThreshold: number
  private readonly growEvery: number
  private readonly shrinkFactor: number
  private samples: Sample[] = []
  private healthyStreak = 0

  constructor(opts: AdaptiveConcurrencyOptions) {
    this.min = Math.max(1, opts.min ?? 1)
    this.max = Math.max(this.min, opts.max)
    this.current = Math.min(this.max, Math.max(this.min, opts.initial))
    this.windowSize = opts.window ?? 50
    this.minSamples = opts.minSamples ?? 10
    this.highLatencyMs = opts.highLatencyMs ?? 15_000
    this.ambiguousRateThreshold = opts.ambiguousRateThreshold ?? 0.2
    this.growEvery = opts.growEvery ?? 25
    this.shrinkFactor = opts.shrinkFactor ?? 0.5
  }

  get limit(): number {
    return this.current
  }

  record(sample: Sample): void {
    this.samples.push(sample)
    if (this.samples.length > this.windowSize) this.samples.shift()
    if (this.samples.length < this.minSamples) return

    const ambiguousRate =
      this.samples.filter((s) => s.ambiguous).length / this.samples.length
    const p95 = this.p95Latency()

    if (p95 > this.highLatencyMs || ambiguousRate > this.ambiguousRateThreshold) {
      this.current = Math.max(
        this.min,
        Math.floor(this.current * this.shrinkFactor)
      )
      this.samples = []
      this.healthyStreak = 0
      return
    }

    const healthy = ambiguousRate === 0 && p95 <= this.highLatencyMs / 2
    this.healthyStreak = healthy ? this.healthyStreak + 1 : 0
    if (this.healthyStreak >= this.growEvery) {
      this.current = Math.min(this.max, this.current + 1)
      this.healthyStreak = 0
    }
  }

  private p95Latency(): number {
    const sorted = this.samples.map((s) => s.latencyMs).sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
  }
}
