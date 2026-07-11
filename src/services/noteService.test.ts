import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createNote, fetchNote, fetchNotes, reorderCourseNotes, updateNote } from './noteService'

beforeEach(async () => {
  await db.transaction('rw', db.notes, db.projects, db.courses, db.directories, db.images, async () => {
    await Promise.all([db.notes.clear(), db.projects.clear(), db.courses.clear(), db.directories.clear(), db.images.clear()])
  })
})

describe('noteService', () => {
  it('并发的局部更新不会互相覆盖', async () => {
    const id = await createNote({ type: 'knowledge_fragment' })
    await Promise.all([
      updateNote(id, { title: '新标题' }),
      updateNote(id, { content: '新正文' }),
    ])
    await expect(fetchNote(id)).resolves.toMatchObject({ title: '新标题', content: '新正文' })
  })

  it('课程章节按 chapterOrder 返回并可事务化重排', async () => {
    const first = await createNote({ type: 'course_chapter', courseId: 'course_1', title: '第一章' })
    const second = await createNote({ type: 'course_chapter', courseId: 'course_1', title: '第二章' })
    expect((await fetchNotes({ courseId: 'course_1' })).map((note) => note.id)).toEqual([first, second])

    await reorderCourseNotes([second, first])
    expect((await fetchNotes({ courseId: 'course_1' })).map((note) => note.id)).toEqual([second, first])
  })
})
