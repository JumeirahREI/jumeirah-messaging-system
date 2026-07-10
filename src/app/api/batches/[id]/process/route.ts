import { NextResponse } from "next/server"

import { processPendingMessages } from "@/lib/server/batch-processing"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const batchId = Number(id)
  if (Number.isNaN(batchId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 })
  }
  try {
    await processPendingMessages(batchId)
    return NextResponse.json({ ok: true, batchId })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطأ في المعالجة" },
      { status: 500 }
    )
  }
}
