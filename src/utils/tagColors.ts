const TAG_COLORS = [
  { bg: 'rgba(125, 207, 255, 0.15)', text: '#7dcfff', dot: '#7dcfff' },
  { bg: 'rgba(187, 154, 247, 0.15)', text: '#bb9af7', dot: '#bb9af7' },
  { bg: 'rgba(158, 206, 106, 0.15)', text: '#9ece6a', dot: '#9ece6a' },
  { bg: 'rgba(230, 159, 0, 0.15)', text: '#e69f00', dot: '#e69f00' },
  { bg: 'rgba(255, 121, 198, 0.15)', text: '#ff79c6', dot: '#ff79c6' },
  { bg: 'rgba(241, 250, 140, 0.15)', text: '#c0ca33', dot: '#f1fa8c' },
]

export function getTagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i)
    hash |= 0
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}