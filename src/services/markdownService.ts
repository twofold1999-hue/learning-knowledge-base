import DOMPurify from 'dompurify'
import { marked } from 'marked'

type ImageResolver = (id: string) => Promise<string | null>

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\\[\]])/g, '\\$1')
}

export async function renderMarkdownPreview(
  markdown: string,
  titleToId: ReadonlyMap<string, string>,
  resolveImage: ImageResolver,
): Promise<string> {
  const withWikiLinks = markdown.replace(/\[\[([^\]\n]+)\]\]/g, (original, rawTitle: string) => {
    const title = rawTitle.trim()
    const id = titleToId.get(title)
    return id ? `[${escapeMarkdownLabel(title)}](#note:${encodeURIComponent(id)})` : original
  })

  const rawHtml = await marked.parse(withWikiLinks, { gfm: true, breaks: true })
  const documentNode = new DOMParser().parseFromString(rawHtml, 'text/html')

  const images = Array.from(documentNode.body.querySelectorAll<HTMLImageElement>('img[src^="img_"]'))
  await Promise.all(images.map(async (image) => {
    const id = image.getAttribute('src') || ''
    const data = await resolveImage(id)
    if (data) image.setAttribute('src', data)
    else image.replaceWith(documentNode.createTextNode(`[图片不可用${image.alt ? `: ${image.alt}` : ''}]`))
  }))

  for (const anchor of documentNode.body.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) {
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
    }
  }

  return DOMPurify.sanitize(documentNode.body.innerHTML, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style'],
    RETURN_TRUSTED_TYPE: false,
  })
}
