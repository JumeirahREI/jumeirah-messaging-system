const SECRET_PARAM = /([?&\s]|^)(password|P)=[^&\s]*/gi

export function redact(text: string, ...secrets: string[]): string {
  let out = text.replace(SECRET_PARAM, "$1$2=***")
  for (const secret of secrets) {
    if (!secret) continue
    for (const variant of new Set([secret, encodeURIComponent(secret)]))
      out = out.split(variant).join("***")
  }
  return out
}
