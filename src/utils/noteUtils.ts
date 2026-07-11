export const LEARNED_MARKER = '<!-- learned:true -->'

export function isLearned(content: string): boolean {
  return content.startsWith(LEARNED_MARKER)
}

export function setLearnedContent(content: string, learned: boolean): string {
  if (learned && !isLearned(content)) return content ? `${LEARNED_MARKER}\n${content}` : LEARNED_MARKER
  if (!learned && isLearned(content)) return content.slice(LEARNED_MARKER.length).replace(/^\n/, '')
  return content
}
