import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  authModule,
  operatorUser,
  resetAuth,
  setTestUser,
} from "@/test/auth"

const getBatchStatus = vi.fn()

vi.mock("@/auth", () => authModule())
vi.mock("@/lib/server/batch-service", () => ({
  getBatchStatus: (...args: unknown[]) => getBatchStatus(...args),
}))

const { GET } = await import("./route")

function call(id: string): Promise<Response> {
  return GET(new Request(`http://localhost:3000/api/batches/${id}/status`), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  getBatchStatus.mockReset().mockResolvedValue({ status: "sending" })
  setTestUser(operatorUser())
})

afterEach(() => {
  resetAuth()
})

describe("GET /api/batches/[id]/status", () => {
  it("401 without a session", async () => {
    setTestUser(null)
    expect((await call("1")).status).toBe(401)
  })

  it.each(["1.5", "-1", "0", "abc", "1e3"])("400 for id %s", async (id) => {
    expect((await call(id)).status).toBe(400)
    expect(getBatchStatus).not.toHaveBeenCalled()
  })

  it("404 for an unknown batch", async () => {
    getBatchStatus.mockResolvedValue(null)
    expect((await call("5")).status).toBe(404)
  })

  it("200 with the status payload", async () => {
    const res = await call("5")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "sending" })
    expect(getBatchStatus).toHaveBeenCalledWith({ batchId: 5 })
  })
})
