"use server"

import type {
  ResolveUnknownInput,
  ResolveUnknownResult,
} from "./unknown-types"

export async function resolveUnknownMessages(
  _input: ResolveUnknownInput
): Promise<ResolveUnknownResult> {
  return { ok: false, error: "غير مُنفَّذ بعد" }
}
