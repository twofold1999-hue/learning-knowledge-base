import { useEffect, useState, type FormEvent } from 'react'
import {
  desktopAISettingsBridge,
  type DesktopAISettings,
  type DesktopAISettingsBridge,
  type DesktopAISettingsError,
} from '../runtime/desktopAISettingsBridge'
import { isDesktopRuntime } from '../runtime/runtimeMode'

export interface DesktopAISettingsPanelProps {
  bridge?: DesktopAISettingsBridge
  onClose?: () => void
}

type FormValues = {
  provider: string
  baseUrl: string
  model: string
  timeoutMs: string
  enabled: boolean
  apiKey: string
}

function valuesFrom(settings: DesktopAISettings): FormValues {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutMs: String(settings.timeoutMs),
    enabled: settings.enabled,
    apiKey: '',
  }
}

function safeErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const candidate = error as DesktopAISettingsError
    return typeof candidate.message === 'string' ? candidate.message : '无法更新桌面 AI 配置。'
  }
  return '无法更新桌面 AI 配置。'
}

export default function DesktopAISettingsPanel({ bridge = desktopAISettingsBridge, onClose }: DesktopAISettingsPanelProps) {
  const [settings, setSettings] = useState<DesktopAISettings | null>(null)
  const [values, setValues] = useState<FormValues | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!isDesktopRuntime()) return () => { active = false }
    void bridge.getSettings().then((next) => {
      if (!active) return
      setSettings(next)
      setValues(valuesFrom(next))
      setStatus('ready')
    }).catch((reason) => {
      if (!active) return
      setError(safeErrorMessage(reason))
      setStatus('error')
    })
    return () => { active = false }
  }, [bridge])

  if (!isDesktopRuntime()) return null

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => current ? { ...current, [key]: value } : current)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!values) return
    setStatus('saving')
    setError(null)
    setNotice(null)
    try {
      const next = await bridge.saveSettings({
        provider: values.provider,
        baseUrl: values.baseUrl,
        model: values.model,
        timeoutMs: Number(values.timeoutMs),
        enabled: values.enabled,
        apiKey: values.apiKey || undefined,
      })
      setSettings(next)
      setValues(valuesFrom(next))
      setStatus('ready')
      setNotice('配置与凭据已安全保存；桌面 AI 请求将在原生 AI 传输接入后可用。')
    } catch (reason) {
      setValues((current) => current ? { ...current, apiKey: '' } : current)
      setError(safeErrorMessage(reason))
      setStatus('error')
    }
  }

  const forget = async () => {
    if (!confirm('忘记此 API Key 会关闭桌面 AI。确定继续吗？')) return
    setStatus('saving')
    setError(null)
    setNotice(null)
    try {
      const next = await bridge.forgetCredential()
      setSettings(next)
      setValues(valuesFrom(next))
      setStatus('ready')
    } catch (reason) {
      setError(safeErrorMessage(reason))
      setStatus('error')
    }
  }

  return <section aria-label="桌面 AI 配置" style={{ marginTop: '20px', padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' }}>
      <div><h2 style={{ margin: 0 }}>桌面 AI 配置</h2><p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>API Key 仅保存在 Windows 凭据管理器，不会写入笔记、备份或浏览器存储。</p></div>
      {onClose && <button type="button" onClick={onClose}>关闭</button>}
    </div>
    {status === 'loading' && <p role="status">正在读取桌面 AI 配置…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {values && <form onSubmit={(event) => { void save(event) }} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
      <label>提供商<select value={values.provider} onChange={(event) => update('provider', event.target.value)}><option value="deepseek">DeepSeek</option></select></label>
      <label>API 地址<input aria-label="API 地址" value={values.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} inputMode="url" /></label>
      <label>模型<input aria-label="模型" value={values.model} onChange={(event) => update('model', event.target.value)} /></label>
      <label>超时（毫秒）<input aria-label="超时（毫秒）" type="number" min="5000" max="120000" value={values.timeoutMs} onChange={(event) => update('timeoutMs', event.target.value)} /></label>
      <label>API Key<input aria-label="API Key" type="password" autoComplete="new-password" spellCheck={false} value={values.apiKey} onChange={(event) => update('apiKey', event.target.value)} placeholder={settings?.credentialConfigured ? '已配置；留空则保持不变' : '仅保存到 Windows 凭据管理器'} /></label>
      <p aria-live="polite" style={{ margin: 0, color: 'var(--muted)' }}>凭据状态：{settings?.credentialConfigured ? `已配置${settings.credentialMask ?? ''}` : '未配置'}；桌面 AI：{settings?.enabled ? '已启用' : '未启用'}。</p>
      <label><input type="checkbox" checked={values.enabled} onChange={(event) => update('enabled', event.target.checked)} /> 启用桌面 AI</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}><button type="submit" disabled={status === 'saving'}>{status === 'saving' ? '正在保存…' : '保存桌面 AI 配置'}</button><button type="button" disabled={status === 'saving' || !settings?.credentialConfigured} onClick={() => { void forget() }}>忘记 API Key</button><button type="button" disabled title="将在原生 AI 传输阶段提供">测试连接（后续版本提供）</button></div>
    </form>}
  </section>
}