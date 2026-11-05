import { describe, expect, it } from "vitest"
import { createGate, runConcurrently } from "@/test/concurrency"

describe("runConcurrently", () => {
  it("starts every function before any proceeds past the barrier", async () => {
    const events: string[] = []
    const make = (name: string) => async () => {
      events.push(`start:${name}`)
      await Promise.resolve()
      events.push(`end:${name}`)
      return name
    }
    const results = await runConcurrently([make("a"), make("b"), make("c")])
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ])
    const firstEnd = events.findIndex((e) => e.startsWith("end:"))
    expect(events.slice(0, firstEnd)).toHaveLength(3)
  })

  it("settles rejections without throwing", async () => {
    const results = await runConcurrently([
      async () => 1,
      async () => {
        throw new Error("x")
      },
    ])
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 })
    expect(results[1]?.status).toBe("rejected")
  })

  it("waits for a caller-provided gate", async () => {
    const gate = createGate()
    let started = false
    const pending = runConcurrently(
      [
        async () => {
          started = true
        },
      ],
      { gate }
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(started).toBe(false)
    gate.open()
    await pending
    expect(started).toBe(true)
  })
})

describe("createGate", () => {
  it("resolves waiters once opened and reports state", async () => {
    const gate = createGate()
    expect(gate.isOpen).toBe(false)
    const waiter = gate.wait().then(() => "released")
    gate.open()
    expect(await waiter).toBe("released")
    expect(gate.isOpen).toBe(true)
    await gate.wait()
  })
})
