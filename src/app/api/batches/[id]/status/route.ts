import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { getBatchStatus } from "@/lib/server/batch-service"
import { parsePositiveInt } from "@/lib/server/parse-id"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  const batchId = parsePositiveInt((await ctx.params).id)
  if (batchId === null) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 })
  }
  const status = await getBatchStatus({ batchId })
  if (!status) {
    return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 })
  }
  return NextResponse.json(status)
}
