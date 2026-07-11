import { describe, expect, it } from 'vitest'
import { renderMarkdownPreview } from './markdownService'

describe('renderMarkdownPreview', () => {
  it('清理脚本、事件属性与 javascript 链接', async () => {
    const html = await renderMarkdownPreview(
      '<img src="x" onerror="alert(1)"><script>alert(1)</script>[危险](javascript:alert(1))',
      new Map(),
      async () => null,
    )
    expect(html).not.toMatch(/script|onerror|javascript:/i)
  })

  it('把 Wiki 链接解析为内部笔记链接', async () => {
    const html = await renderMarkdownPreview('参见 [[目标笔记]]', new Map([['目标笔记', 'note_1']]), async () => null)
    expect(html).toContain('href="#note:note_1"')
  })

  it('只注入经过图片服务校验的数据', async () => {
    const html = await renderMarkdownPreview('![截图](img_1)', new Map(), async () => 'data:image/png;base64,aGVsbG8=')
    expect(html).toContain('data:image/png;base64,aGVsbG8=')
  })
})
