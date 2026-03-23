import { create } from 'zustand'

export type Screen = 'home' | 'lobby' | 'game'

interface Toast {
  id: string
  message: string
}

interface UiState {
  screen: Screen
  error: string | null
  isRolling: boolean
  goOutWindowOpen: boolean
  toasts: Toast[]
  setScreen: (screen: Screen) => void
  setError: (error: string | null) => void
  setRolling: (rolling: boolean) => void
  setGoOutWindow: (open: boolean) => void
  addToast: (message: string) => void
  removeToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'home',
  error: null,
  isRolling: false,
  goOutWindowOpen: false,
  toasts: [],

  setScreen: (screen) => set({ screen }),
  setError: (error) => set({ error }),
  setRolling: (isRolling) => set({ isRolling }),
  setGoOutWindow: (goOutWindowOpen) => set({ goOutWindowOpen }),

  addToast: (message) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3500)
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
