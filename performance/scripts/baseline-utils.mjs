/** Returns the median without reordering the caller's samples. */
export function median(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Separates volatile generation metadata from measurements that can be compared across runs. */
export function stableMeasurementEnvelope(measurement, generatedAt = new Date().toISOString()) {
  return { generatedAt, measurement: { ...measurement } }
}

export function toMiB(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(3))
}