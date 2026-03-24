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
  phaseOverlay: { phase: number; active: boolean } | null
  rollResult: { value: number; isKill: boolean } | null
  showConfetti: boolean
  soundMuted: boolean

  setScreen: (screen: Screen) => void
  setError: (error: string | null) => void
  setRolling: (rolling: boolean) => void
  setGoOutWindow: (open: boolean) => void
  addToast: (message: string) => void
  removeToast: (id: string) => void
  showPhaseOverlay: (phase: number) => void
  setRollResult: (value: number, isKill: boolean) => void
  triggerConfetti: () => void
  toggleSound: () => void
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'home',
  error: null,
  isRolling: false,
  goOutWindowOpen: false,
  toasts: [],
  phaseOverlay: null,
  rollResult: null,
  showConfetti: false,
  soundMuted: false,

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

  showPhaseOverlay: (phase) => {
    set({ phaseOverlay: { phase, active: true } })
    setTimeout(() => set({ phaseOverlay: null }), 4000)
  },

  setRollResult: (value, isKill) => {
    set({ rollResult: { value, isKill } })
    setTimeout(() => set({ rollResult: null }), 1500)
  },

  triggerConfetti: () => {
    set({ showConfetti: true })
    setTimeout(() => set({ showConfetti: false }), 5000)
  },

  toggleSound: () => set((s) => ({ soundMuted: !s.soundMuted })),
}))
