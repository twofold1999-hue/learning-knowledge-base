import { describe, expect, it, vi } from 'vitest'
import { AIService } from './ai-service'
import { buildNoteMetadataPrompt } from './prompts/extract-metadata.prompt'

function serviceWithOutput(content: string) {
  return new AIService({ chat: vi.fn().mockResolvedValue({
    id: 'metadata_1', model: 'test', createdAt: new Date(),
    choices: [{ index: 0, finishReason: 'stop', message: { role: 'assistant', content } }],
  }) })
}

describe('buildNoteMetadataPrompt', () => {
  it('生成要求只输出 JSON 的元数据提取提示词', () => {
    const messages = buildNoteMetadataPrompt('# CPU\n缓存层级')
    expect(messages[0].content).toContain('合法 JSON 对象')
    expect(messages[1].content).toContain('# CPU')
  })
})

describe('AIService.extractMetadata', () => {
  it('解析正常 AI JSON 数据，并规范化重复条目', async () => {
    const service = serviceWithOutput('```json\n{"title":"CPU 缓存","summary":"缓存层级。","tags":["硬件","硬件"],"concepts":["L1 Cache"],"relatedTopics":["内存层级"]}\n```')
    await expect(service.extractMetadata('原始 Markdown')).resolves.toEqual({
      title: 'CPU 缓存', summary: '缓存层级。', tags: ['硬件'], concepts: ['L1 Cache'], relatedTopics: ['内存层级'],
    })
  })

  it('处理异常 JSON 与异常字段结构', async () => {
    await expect(serviceWithOutput('{not-json}').extractMetadata('内容')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    await expect(serviceWithOutput('{"title":"标题","summary":"摘要","tags":"错误","concepts":[],"relatedTopics":[]}').extractMetadata('内容')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
  })

  it('处理空结果', async () => {
    const service = new AIService({ chat: vi.fn().mockResolvedValue({ id: 'empty', model: 'test', createdAt: new Date(), choices: [] }) })
    await expect(service.extractMetadata('内容')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
  })
})
