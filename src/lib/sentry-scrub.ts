export function scrubEvent<T>(event: T): T {
  return event
}

export function parseSampleRate(
  _value: string | undefined,
  fallback: number
): number {
  return fallback
}
