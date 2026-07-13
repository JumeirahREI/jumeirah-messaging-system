import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { requireRole } from "@/lib/server/auth-helpers"
import { processPendingMessages } from "@/lib/server/batch-processing"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  try {
    await requireRole("operator")
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
  }

  const origin = req.headers.get("origin")
  const host = req.headers.get("host")
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
  }

  const { id } = await ctx.params
  const batchId = Number(id)
  if (Number.isNaN(batchId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 })
  }

  void processPendingMessages(batchId).catch((err) => {
    console.error(`[process] batch ${batchId} failed`, err)
  })

  return NextResponse.json({ ok: true, batchId }, { status: 202 })
}
