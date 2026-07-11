import type { Note } from '../types'
import { getImage } from './imageService'
import JSZip from 'jszip'
import { renderMarkdownPreview } from './markdownService'

const imageReference = /!\[([^\]]*)\]\((img_[^\s)]+)(?:\s+[^)]*)?\)/g

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || '无标题笔记'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export async function noteToMarkdown(note: Note): Promise<string> {
  const content = await replaceLocalImages(note.content)
  const metadata = [
    '---',
    `title: ${yamlString(note.title || '无标题')}`,
    `type: ${note.type === 'knowledge_fragment' ? '自由笔记' : '学习单元'}`,
    `tags: ${JSON.stringify(note.tags)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    note.sourceLocation ? `sourceLocation: ${yamlString(note.sourceLocation)}` : null,
    note.videoTimestamp ? `videoTimestamp: ${yamlString(note.videoTimestamp)}` : null,
    '---',
  ].filter(Boolean).join('\n')

  return `${metadata}\n\n# ${note.title || '无标题'}\n\n${content.trim()}\n`
}

async function replaceLocalImages(content: string): Promise<string> {
  const matches = [...content.matchAll(imageReference)]
  if (matches.length === 0) return content
  const replacements = await Promise.all(matches.map(async (match) => {
    const data = await getImage(match[2])
    return data ? `![${match[1]}](${data})` : match[0]
  }))
  let index = 0
  return content.replace(imageReference, () => replacements[index++])
}

export async function notesToMarkdown(notes: Note[]): Promise<string> {
  const exports = await Promise.all(notes.map(noteToMarkdown))
  return exports.join('\n\n---\n\n')
}

function dataUrlExtension(data: string): string {
  const mime = data.slice(5, data.indexOf(';')).toLowerCase()
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
  }
  return extensions[mime] ?? 'png'
}

function noteToPortableMarkdown(note: Note, attachmentPaths: Map<string, string>): string {
  const content = note.content.replace(imageReference, (original, alt: string, imageId: string) => {
    const attachmentPath = attachmentPaths.get(imageId)
    return attachmentPath ? `![${alt}](../${attachmentPath})` : original
  })
  const metadata = [
    '---',
    `title: ${yamlString(note.title || '无标题')}`,
    `type: ${note.type === 'knowledge_fragment' ? '自由笔记' : '学习单元'}`,
    `tags: ${JSON.stringify(note.tags)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    note.sourceLocation ? `sourceLocation: ${yamlString(note.sourceLocation)}` : null,
    note.videoTimestamp ? `videoTimestamp: ${yamlString(note.videoTimestamp)}` : null,
    '---',
  ].filter(Boolean).join('\n')
  return `${metadata}\n\n# ${note.title || '无标题'}\n\n${content.trim()}\n`
}

/**
 * Exports a portable Markdown folder as a ZIP archive. Each note is a separate
 * .md file and locally stored pictures are saved as regular image attachments,
 * which is more compatible with iPad Markdown editors than embedded data URLs.
 */
export async function downloadPortableMarkdownArchive(notes: Note[]): Promise<void> {
  const zip = new JSZip()
  const exportedOn = new Date().toISOString().slice(0, 10)
  const root = `learning-knowledge-base-${exportedOn}`
  const attachmentPaths = new Map<string, string>()
  const imageIds = new Set<string>()

  for (const note of notes) {
    for (const match of note.content.matchAll(imageReference)) imageIds.add(match[2])
  }

  for (const imageId of imageIds) {
    const data = await getImage(imageId)
    if (!data) continue
    const extension = dataUrlExtension(data)
    const path = `attachments/${imageId}.${extension}`
    const comma = data.indexOf(',')
    if (comma < 0) continue
    zip.file(`${root}/${path}`, data.slice(comma + 1), { base64: true })
    attachmentPaths.set(imageId, path)
  }

  notes.forEach((note) => {
    const suffix = note.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'note'
    const filename = `${safeFilename(note.title)}-${suffix}.md`
    zip.file(`${root}/notes/${filename}`, noteToPortableMarkdown(note, attachmentPaths))
  })

  zip.file(`${root}/README.md`, [
    '# 学习知识库 — iPad 笔记包',
    '',
    '这是一个标准 Markdown 文件夹：每篇笔记位于 `notes/`，图片位于 `attachments/`。',
    '',
    '## 在 iPad 上使用',
    '',
    '1. 在“文件”App 中解压此 ZIP。',
    '2. 将整个文件夹移动到 iCloud Drive（或你常用的云盘）。',
    '3. 在支持 Markdown 文件夹的笔记 App 中打开该文件夹；图片会保持相对路径关联。',
    '',
    '提示：这是可阅读、可继续编辑的副本；如需以后导回本知识库，请同时保留设置中的“完整备份 JSON”。',
  ].join('\n'))

  const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  downloadBlob(archive, `${root}-ipad.zip`)
}

export function downloadTextFile(content: string, filename: string, type = 'text/markdown;charset=utf-8'): void {
  downloadBlob(new Blob([content], { type }), filename)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadNotesAsMarkdown(notes: Note[], filename?: string): Promise<void> {
  const content = await notesToMarkdown(notes)
  const defaultName = notes.length === 1
    ? `${safeFilename(notes[0].title)}.md`
    : `knowledge-base-${new Date().toISOString().slice(0, 10)}.md`
  downloadTextFile(content, filename ?? defaultName)
}

function exportTitleMap(notes: Note[]): Map<string, string> {
  return new Map(notes.filter((note) => note.title.trim()).map((note) => [note.title.trim(), note.id]))
}

/** Creates a PDF designed for reading and handwriting annotation in Goodnotes. */
export async function downloadNotesAsPdf(notes: Note[]): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js')
  const titleMap = exportTitleMap(notes)
  const sections = await Promise.all(notes.map(async (note) => {
    const html = await renderMarkdownPreview(note.content, titleMap, getImage)
    const tags = note.tags.length ? `<div class="tags">${note.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>` : ''
    return `<article class="export-note"><h1>${escapeHtml(note.title || '无标题')}</h1>${tags}<div class="content">${html}</div></article>`
  }))
  const root = document.createElement('main')
  root.setAttribute('aria-hidden', 'true')
  root.style.cssText = 'position:fixed;left:-20000px;top:0;width:190mm;padding:18mm 16mm;background:#fff;color:#172033;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;font-size:11pt;line-height:1.75;box-sizing:border-box;'
  root.innerHTML = `<style>
    .export-note { break-after: page; page-break-after: always; } .export-note:last-child { break-after: auto; page-break-after: auto; }
    h1 { font-size: 23pt; margin:0 0 7mm; } h2 { font-size:17pt; margin-top:8mm; } h3 { font-size:14pt; margin-top:6mm; }
    p, li { line-height:1.75; } img { max-width:100%; height:auto; border-radius:4px; } pre { white-space:pre-wrap; padding:4mm; background:#f3f5f8; border-radius:4px; } code { font-family:Consolas,monospace; }
    blockquote { margin:4mm 0; padding-left:4mm; border-left:3px solid #7aa2f7; color:#46536a; } table { width:100%; border-collapse:collapse; } td,th { border:1px solid #cbd5e1; padding:2mm; } .tags { margin:-3mm 0 7mm; } .tags span { display:inline-block; margin-right:2mm; padding:1mm 2mm; border-radius:3mm; background:#e9f0ff; color:#2f6fed; font-size:9pt; }
  </style>${sections.join('')}`
  document.body.appendChild(root)
  try {
    const pdf = html2pdf() as unknown as { set: (options: Record<string, unknown>) => { from: (element: HTMLElement) => { save: () => Promise<void> } } }
    await pdf
      .set({ margin: 0, filename: `knowledge-base-${new Date().toISOString().slice(0, 10)}.pdf`, image: { type: 'jpeg', quality: 0.96 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } })
      .from(root)
      .save()
  } finally {
    root.remove()
  }
}

/** Exports a real .docx document for Word and iPadOS/Goodnotes import. */
export async function downloadNotesAsDocx(notes: Note[]): Promise<void> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx')
  const wordParagraphs = (markdown: string): import('docx').Paragraph[] => {
    const paragraphs: import('docx').Paragraph[] = []
    markdown.replace(/\r/g, '').split('\n').forEach((line) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line)
      if (heading) {
        const level = heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
        paragraphs.push(new Paragraph({ text: heading[2], heading: level }))
        return
      }
      const list = /^[-*+]\s+(.+)$/.exec(line)
      if (list) {
        paragraphs.push(new Paragraph({ text: list[1].replace(/[*_`]/g, ''), bullet: { level: 0 } }))
        return
      }
      const image = /^!\[([^\]]*)\]\([^)]*\)$/.exec(line)
      if (image) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: `[图片：${image[1] || '未命名'}]`, italics: true, color: '6b7280' })] }))
        return
      }
      if (line.trim()) paragraphs.push(new Paragraph({ text: line.replace(/[*_`]/g, '') }))
      else paragraphs.push(new Paragraph({ text: '' }))
    })
    return paragraphs
  }
  const children: import('docx').Paragraph[] = []
  notes.forEach((note, index) => {
    children.push(new Paragraph({ text: note.title || '无标题', heading: HeadingLevel.TITLE, pageBreakBefore: index > 0 }))
    if (note.tags.length) children.push(new Paragraph({ children: [new TextRun({ text: note.tags.map((tag) => `#${tag}`).join('  '), color: '2f6fed' })] }))
    children.push(...wordParagraphs(note.content))
  })
  const document = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(document)
  downloadBlob(blob, `knowledge-base-${new Date().toISOString().slice(0, 10)}.docx`)
}
