import { invoke } from '@tauri-apps/api/core'
import { isDesktopRuntime } from '../runtime/runtimeMode'
import { normalizeLearningSourceUrl } from './learningSources'

/** Opens only a validated HTTP(S) source after an explicit user action. */
export async function openExternalLearningSource(value: string): Promise<void> {
  const url = normalizeLearningSourceUrl(value)
  if (isDesktopRuntime()) { await invoke('open_external_learning_source', { url }); return }
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) throw new Error('浏览器阻止了打开新窗口，请允许此操作后重试')
  opened.opener = null
}
