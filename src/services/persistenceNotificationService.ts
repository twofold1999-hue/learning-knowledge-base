import { scheduleLocalBackup } from './localBackupService'

/**
 * Announces that an IndexedDB write has committed. The existing scheduler
 * decides whether and when a local-directory backup is written.
 */
export function notifyPersistenceCommitted(): void {
  try {
    scheduleLocalBackup()
  } catch (error) {
    // A backup notification must never turn an already committed data change
    // into an application error.
    console.warn('无法调度本地备份:', error)
  }
}
