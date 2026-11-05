import { and, eq, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { requireRole } from "@/lib/server/auth-helpers"
import { dispatchBatchProcessing } from "@/lib/server/batch/dispatch"
import { db } from "@/lib/server/db"
import { verifyBearer } from "@/lib/server/function-auth"
import { parsePositiveInt } from "@/lib/server/parse-id"
import { checkRateLimit, mutationLimiter } from "@/lib/server/rate-limit"
import { batchSessions } from "@/lib/server/schema"

export const runtime = "nodejs"
export const maxDuration = 300

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status })

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return false
  const host = req.headers.get("host") ?? new URL(req.url).host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return fail("غير مصرح", 401)
  try {
    await requireRole("operator")
  } catch {
    return fail("غير مصرح", 403)
  }

  const hasFunctionSecret = verifyBearer(
    req.headers.get("authorization"),
    process.env.NETLIFY_FUNCTION_SECRET
  )
  if (!hasFunctionSecret && !isSameOrigin(req)) return fail("غير مصرح", 403)

  const batchId = parsePositiveInt((await ctx.params).id)
  if (batchId === null) return fail("معرّف غير صالح", 400)

  const allowed = await checkRateLimit(
    mutationLimiter,
    `mutation:${session.user.id}`
  )
  if (!allowed) return fail("محاولات كثيرة. حاول مرة أخرى لاحقًا", 429)

  const [batch] = await db
    .select({ status: batchSessions.status })
    .from(batchSessions)
    .where(and(eq(batchSessions.id, batchId), isNull(batchSessions.deletedAt)))
    .limit(1)
  if (!batch) return fail("الدفعة غير موجودة", 404)
  if (batch.status !== "sending") return fail("الدفعة ليست قيد الإرسال", 409)

  try {
    const dispatched = await dispatchBatchProcessing(batchId)
    if (!dispatched.ok) {
      console.error(`[process] batch ${batchId} dispatch failed`, dispatched)
      return fail("تعذر بدء المعالجة", 502)
    }
  } catch (err) {
    console.error(`[process] batch ${batchId} dispatch threw`, err)
    return fail("تعذر بدء المعالجة", 502)
  }

  return NextResponse.json({ ok: true, batchId }, { status: 202 })
}
