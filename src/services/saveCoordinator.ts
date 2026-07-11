const pendingWrites = new Set<Promise<unknown>>()

export function trackPendingSave<T>(operation: Promise<T>): Promise<T> {
  pendingWrites.add(operation)
  void operation.finally(() => pendingWrites.delete(operation)).catch(() => undefined)
  return operation
}

export async function waitForPendingSaves(): Promise<void> {
  while (pendingWrites.size > 0) {
    await Promise.allSettled([...pendingWrites])
  }
}
