import type { AIConfig, AIConfigInput } from './types'

const DEFAULT_TIMEOUT_MS = 65_000
let runtimeOverrides: AIConfigInput = {}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/** Browser configuration intentionally has no credential, model or provider URL fields. */
export function configureAI(config: AIConfigInput): void {
  runtimeOverrides = { ...runtimeOverrides, ...config }
}

export function resetAIConfiguration(): void {
  runtimeOverrides = {}
}

export function getAIConfig(): AIConfig {
  return { timeoutMs: positiveNumber(runtimeOverrides.timeoutMs, DEFAULT_TIMEOUT_MS) }
}

