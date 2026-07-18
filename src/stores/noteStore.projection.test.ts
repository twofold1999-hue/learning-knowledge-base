import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../services/db'
import { useNoteStore } from './noteStore'

beforeEach(async () => {
  await db.notes.clear()
  useNoteStore.setState({ notes: [], allNotes: [], currentNote: null, isLoading: false, isSaving: false, saveError: null })
})

describe('noteStore projection boundary', () => {
  it('keeps list state lightweight while the current editor note remains complete', async () => {
    const store = useNoteStore.getState()
    const id = await store.createNote({ type: 'knowledge_fragment', title: '投影边界' })
    await useNoteStore.getState().updateNote(id, { content: `${'正文'.repeat(180)} [[目标]]` })

    const current = useNoteStore.getState().currentNote
    const projection = useNoteStore.getState().allNotes.find((item) => item.id === id)

    expect(current?.content).toContain('正文')
    expect(projection?.wikiTargets).toEqual(['目标'])
    expect(projection?.contentPreview.length).toBeLessThanOrEqual(200)
    expect(projection && 'content' in projection).toBe(false)
  })

  it('does not replace projections after a failed persisted update', async () => {
    const store = useNoteStore.getState()
    const id = await store.createNote({ type: 'knowledge_fragment', title: '保持原状' })
    const before = useNoteStore.getState().allNotes.find((item) => item.id === id)
    await db.notes.delete(id)

    await expect(useNoteStore.getState().updateNote(id, { content: '不会持久化' })).rejects.toThrow('Note not found')

    expect(useNoteStore.getState().allNotes.find((item) => item.id === id)).toBe(before)
  })
})
