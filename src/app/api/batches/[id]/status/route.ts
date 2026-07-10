import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { getBatchStatus } from "@/lib/server/batch-service"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  const { id } = await ctx.params
  const batchId = Number(id)
  if (Number.isNaN(batchId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 })
  }
  const status = await getBatchStatus({ batchId })
  return NextResponse.json(status)
}
