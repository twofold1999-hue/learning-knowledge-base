import { useContext, createContext } from 'react'

export interface DesktopWorkspaceActions { isDesktop: boolean; returnToControlCenter(): void; requestSafeExit(): void }
export const DesktopWorkspaceContext = createContext<DesktopWorkspaceActions>({ isDesktop: false, returnToControlCenter: () => undefined, requestSafeExit: () => undefined })
export function useDesktopWorkspaceActions(): DesktopWorkspaceActions { return useContext(DesktopWorkspaceContext) }
