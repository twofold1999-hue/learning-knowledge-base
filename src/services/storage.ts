const STORAGE_PREFIX = 'learning_app_'
const NOTES_KEY = STORAGE_PREFIX + 'notes'
const PROJECTS_KEY = STORAGE_PREFIX + 'projects'
const COURSES_KEY = STORAGE_PREFIX + 'courses'

export function generateId(prefix: string): string {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

function readStorage<T>(key: string): T[] {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : []
}

function writeStorage<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

export { NOTES_KEY, PROJECTS_KEY, COURSES_KEY, readStorage, writeStorage }
