export function normalizeAllowedOrigin(input: string | undefined): string | null {
  return input ?? null
}

export function resolveAllowedOrigins(input: string | undefined): string[] {
  return input ? [input] : ["localhost:3000"]
}
