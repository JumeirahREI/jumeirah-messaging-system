export function getClientIp(headers: Pick<Headers, "get">): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]
  const ip =
    headers.get("x-nf-client-connection-ip")?.trim() ||
    forwardedFor?.trim() ||
    headers.get("x-real-ip")?.trim()
  return ip ? ip.toLowerCase() : "unknown"
}
