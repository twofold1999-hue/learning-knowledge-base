type SaveFlusher = () => Promise<void>
const pendingWrites = new Set<Promise<unknown>>()
const failedWrites: unknown[] = []
const flushers = new Map<string, SaveFlusher>()

export function trackPendingSave<T>(operation: Promise<T>): Promise<T> {
  pendingWrites.add(operation)
  void operation.then(undefined, (error) => { failedWrites.push(error) }).finally(() => pendingWrites.delete(operation))
  return operation
}

export function registerSaveFlusher(id: string, flusher: SaveFlusher): () => void {
  flushers.set(id, flusher)
  return () => { if (flushers.get(id) === flusher) flushers.delete(id) }
}

export async function waitForPendingSaves(): Promise<void> {
  while (pendingWrites.size > 0) await Promise.allSettled([...pendingWrites])
  const failures = failedWrites.splice(0)
  if (failures.length) throw new Error('存在尚未保存完成的操作')
}

export interface SaveBarrierResult { success: boolean; pendingCount: number; safeErrorMessage: string | null }
export async function flushAllPendingSaves(): Promise<SaveBarrierResult> {
  const flusherResults = await Promise.allSettled([...flushers.values()].map((flusher) => flusher()))
  if (flusherResults.some((result) => result.status === 'rejected')) return { success: false, pendingCount: pendingWrites.size, safeErrorMessage: '存在尚未保存完成的操作。' }
  try { await waitForPendingSaves(); return { success: true, pendingCount: 0, safeErrorMessage: null } }
  catch { return { success: false, pendingCount: pendingWrites.size, safeErrorMessage: '存在尚未保存完成的操作。' } }
}
