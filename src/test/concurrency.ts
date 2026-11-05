export interface Gate {
  readonly isOpen: boolean
  open: () => void
  wait: () => Promise<void>
}

export function createGate(): Gate {
  let isOpen = false
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    get isOpen() {
      return isOpen
    },
    open: () => {
      isOpen = true
      release()
    },
    wait: () => promise,
  }
}

export async function runConcurrently<T>(
  fns: Array<() => Promise<T>>,
  opts: { gate?: Gate } = {}
): Promise<PromiseSettledResult<T>[]> {
  const gate = opts.gate ?? createGate()
  const started = fns.map(async (fn) => {
    await gate.wait()
    return fn()
  })
  if (!opts.gate) gate.open()
  return Promise.allSettled(started)
}
