export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("invalid chunk size")
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size))
  }
  return groups
}

export async function mapChunks<T, R>(
  items: readonly T[],
  size: number,
  fn: (part: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = []
  for (const part of chunk(items, size)) results.push(...(await fn(part)))
  return results
}
