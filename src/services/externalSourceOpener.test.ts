import { describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../runtime/runtimeMode', () => ({ isDesktopRuntime: () => true }))

describe('external source opener', () => {
  it('passes only a normalized URL to the fixed desktop command', async () => {
    const { openExternalLearningSource } = await import('./externalSourceOpener')
    await openExternalLearningSource(' https://example.com/docs ')
    expect(invoke).toHaveBeenCalledWith('open_external_learning_source', { url: 'https://example.com/docs' })
  })
})
