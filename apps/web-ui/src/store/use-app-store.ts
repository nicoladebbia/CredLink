import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface AppState {
  // UI State
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timestamp: Date
  }>
  
  // User Preferences
  recentFiles: Array<{
    name: string
    size: number
    timestamp: Date
    url?: string
  }>
  
  // Signing History
  signingHistory: Array<{
    id: string
    fileName: string
    status: 'pending' | 'success' | 'failed'
    timestamp: Date
    result?: any
  }>
  
  // Actions
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  addNotification: (notification: Omit<AppState['notifications'][0], 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  addRecentFile: (file: { name: string; size: number; url?: string }) => void
  clearRecentFiles: () => void
  addSigningHistory: (entry: Omit<AppState['signingHistory'][0], 'id' | 'timestamp'>) => void
  clearSigningHistory: () => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Initial State
        sidebarOpen: false,
        theme: 'system',
        notifications: [],
        recentFiles: [],
        signingHistory: [],
        
        // Actions
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        
        setTheme: (theme) => set({ theme }),
        
        addNotification: (notification) => set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ].slice(-10), // Keep only last 10 notifications
        })),
        
        removeNotification: (id) => set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
        
        clearNotifications: () => set({ notifications: [] }),
        
        addRecentFile: (file) => set((state) => ({
          recentFiles: [
            { ...file, timestamp: new Date() },
            ...state.recentFiles,
          ].slice(-5), // Keep only last 5 files
        })),
        
        clearRecentFiles: () => set({ recentFiles: [] }),
        
        addSigningHistory: (entry) => set((state) => ({
          signingHistory: [
            { ...entry, id: crypto.randomUUID(), timestamp: new Date() },
            ...state.signingHistory,
          ].slice(-20), // Keep only last 20 entries
        })),
        
        clearSigningHistory: () => set({ signingHistory: [] }),
      }),
      {
        name: 'credlink-app-store',
        partialize: (state) => ({
          theme: state.theme,
          recentFiles: state.recentFiles,
          signingHistory: state.signingHistory,
        }),
      }
    )
  )
)
