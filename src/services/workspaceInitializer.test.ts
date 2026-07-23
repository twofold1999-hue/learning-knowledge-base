import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchNoteProjections: vi.fn(),
  fetchProjects: vi.fn(),
  fetchCourses: vi.fn(),
  fetchDirectories: vi.fn(),
  setNoteState: vi.fn(),
  setProjectState: vi.fn(),
  setDirectoryState: vi.fn(),
}))
const { fetchNoteProjections, fetchProjects, fetchCourses, fetchDirectories, setNoteState, setProjectState, setDirectoryState } = mocks

vi.mock('./noteService', () => ({ fetchNoteProjections: mocks.fetchNoteProjections }))
vi.mock('./projectService', () => ({ fetchProjects: mocks.fetchProjects, fetchCourses: mocks.fetchCourses }))
vi.mock('./directoryService', () => ({ fetchDirectories: mocks.fetchDirectories }))
vi.mock('../stores/noteStore', () => ({ useNoteStore: { setState: mocks.setNoteState } }))
vi.mock('../stores/projectStore', () => ({ useProjectStore: { setState: mocks.setProjectState } }))
vi.mock('../stores/directoryStore', () => ({ useDirectoryStore: { setState: mocks.setDirectoryState } }))

import { initializeWorkspace } from './workspaceInitializer'

describe('workspace initializer', () => {
  afterEach(() => { vi.clearAllMocks() })

  it('deduplicates concurrent reads and updates stores only after all required data succeeds', async () => {
    fetchNoteProjections.mockResolvedValue([{ id: 'note' }])
    fetchProjects.mockResolvedValue([{ id: 'project' }])
    fetchCourses.mockResolvedValue([{ id: 'course' }])
    fetchDirectories.mockResolvedValue([{ id: 'directory' }])

    await Promise.all([initializeWorkspace(), initializeWorkspace()])

    expect(fetchNoteProjections).toHaveBeenCalledTimes(1)
    expect(fetchProjects).toHaveBeenCalledTimes(1)
    expect(fetchCourses).toHaveBeenCalledTimes(1)
    expect(fetchDirectories).toHaveBeenCalledTimes(1)
    expect(setNoteState).toHaveBeenCalledWith({ allNotes: [{ id: 'note' }] })
  })

  it('rejects without publishing a partial workspace when a required read fails', async () => {
    fetchNoteProjections.mockRejectedValueOnce(new Error('read failed'))
    fetchProjects.mockResolvedValue([])
    fetchCourses.mockResolvedValue([])
    fetchDirectories.mockResolvedValue([])

    await expect(initializeWorkspace()).rejects.toThrow('read failed')
    expect(setNoteState).not.toHaveBeenCalled()
    expect(setProjectState).not.toHaveBeenCalled()
    expect(setDirectoryState).not.toHaveBeenCalled()
  })
})