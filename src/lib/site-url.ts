const HOST_PATTERN =
  /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/

export function normalizeAllowedOrigin(
  input: string | undefined
): string | null {
  const host = input
    ?.trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase()
  if (!host || !HOST_PATTERN.test(host)) return null
  const port = host.split(":")[1]
  if (port && Number(port) > 65535) return null
  return host
}

export function resolveAllowedOrigins(input: string | undefined): string[] {
  return [normalizeAllowedOrigin(input) ?? "localhost:3000"]
}
