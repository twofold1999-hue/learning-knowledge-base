import { describe, expect, it } from 'vitest'
import { AIError } from './types'
import { parseKnowledgeCandidatesJson } from './knowledge-candidates'

const payload = {
  entities: [
    { key: 'cpu', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept', description: '处理器核心。', noteRole: 'defines', confidence: 0.9 },
    { key: 'cache', canonicalName: '缓存', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 0.8 },
  ],
  relations: [
    { fromEntityKey: 'cpu', toEntityKey: 'cache', relationType: 'explains', confidence: 0.85 },
  ],
}

describe('知识候选严格解析', () => {
  it('移除 JSON 代码围栏并返回可选择的稳定关系 key', () => {
    const result = parseKnowledgeCandidatesJson(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)
    expect(result.entities).toHaveLength(2)
    expect(result.relations).toEqual([expect.objectContaining({ key: 'cpu|explains|cache', fromEntityKey: 'cpu', toEntityKey: 'cache' })])
  })

  it('合并一致的重复实体并重映射关系端点，保留更高置信度', () => {
    const result = parseKnowledgeCandidatesJson(JSON.stringify({
      entities: [
        payload.entities[0],
        { ...payload.entities[0], key: 'cpu-copy', aliases: ['处理器'], confidence: 0.95 },
        payload.entities[1],
      ],
      relations: [{ fromEntityKey: 'cpu-copy', toEntityKey: 'cache', relationType: 'explains', confidence: 0.7 }],
    }))
    expect(result.entities).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'cpu', aliases: expect.arrayContaining(['中央处理器', '处理器']), confidence: 0.95 })]))
    expect(result.relations[0]).toMatchObject({ fromEntityKey: 'cpu', toEntityKey: 'cache' })
  })

  it('拒绝非法枚举、置信度、冲突重复实体、未知关系端点和自关联', () => {
    const invalidInputs = [
      { ...payload, entities: [{ ...payload.entities[0], type: 'invalid' }] },
      { ...payload, entities: [{ ...payload.entities[0], confidence: 2 }] },
      { ...payload, entities: [payload.entities[0], { ...payload.entities[0], key: 'conflict', type: 'tool' }] },
      { ...payload, relations: [{ ...payload.relations[0], toEntityKey: 'unknown' }] },
      { ...payload, relations: [{ ...payload.relations[0], toEntityKey: 'cpu' }] },
    ]
    for (const invalid of invalidInputs) {
      expect(() => parseKnowledgeCandidatesJson(JSON.stringify(invalid))).toThrow(AIError)
      expect(() => parseKnowledgeCandidatesJson(JSON.stringify(invalid))).toThrow(/AI 返回的知识候选/)
    }
  })

  it('规范化双向关系并合并重复关系的最高置信度', () => {
    const result = parseKnowledgeCandidatesJson(JSON.stringify({
      ...payload,
      relations: [
        { fromEntityKey: 'cache', toEntityKey: 'cpu', relationType: 'related_to', confidence: 0.6 },
        { fromEntityKey: 'cpu', toEntityKey: 'cache', relationType: 'related_to', confidence: 0.9 },
      ],
    }))
    expect(result.relations).toEqual([expect.objectContaining({ key: 'cache|related_to|cpu', confidence: 0.9 })])
  })
})