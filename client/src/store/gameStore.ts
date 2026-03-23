import { create } from 'zustand'
import socket from '../socket'
import { scoreRoll } from '@shared/scoring'
import { DICE_ANIMATION_MS, GO_OUT_WINDOW_MS, KILL_NUMBER } from '@shared/constants'
import type { Room, Player, ChatMessage, RollEvent } from '@shared/types'
import { useUiStore } from './uiStore'

interface GameState {
  connected: boolean
  myPlayerId: string | null
  room: Room | null
  chatMessages: ChatMessage[]
  // actions
  createRoom: (displayName: string) => void
  joinRoom: (code: string, displayName: string) => void
  startGame: () => void
  rollDice: () => void
  goOut: () => void
  sendChat: (text: string, type: 'message' | 'emoji') => void
}

export const useGameStore = create<GameState>((set) => {
  // ── socket listeners ────────────────────────────────────────────────────

  socket.on('connect', () => {
    set({ connected: true, myPlayerId: socket.id })
  })

  socket.on('disconnect', () => {
    set({ connected: false })
  })

  socket.on('room_state', (room: Room) => {
    set({ room })
    useUiStore.getState().setScreen('lobby')
  })

  socket.on('player_joined', (player: Player) => {
    set((s) => {
      if (!s.room) return s
      return { room: { ...s.room, players: [...s.room.players, player] } }
    })
  })

  socket.on('player_left', (playerId: string) => {
    set((s) => {
      if (!s.room) return s
      return {
        room: { ...s.room, players: s.room.players.filter((p) => p.id !== playerId) },
      }
    })
  })

  socket.on('game_started', (room: Room) => {
    set({ room })
    useUiStore.getState().setScreen('game')
  })

  socket.on('roll_result', (event: RollEvent) => {
    set((s) => {
      if (!s.room) return s
      const roller = s.room.players.find((p) => p.id === event.rollerId)
      if (!roller) return s
      const { points } = scoreRoll(event.result, s.room.phase, roller.roundScore)
      const updatedPlayers = s.room.players.map((p) => {
        if (p.id !== event.rollerId) return p
        return { ...p, roundScore: p.roundScore + points }
      })
      const updatedRoom: Room = {
        ...s.room,
        players: updatedPlayers,
        lastRoll: event.result,
        rollHistory: [...s.room.rollHistory, event],
      }
      return { room: updatedRoom }
    })

    // manage rolling/go-out window UI state
    const ui = useUiStore.getState()
    ui.setRolling(true)
    setTimeout(() => ui.setRolling(false), DICE_ANIMATION_MS)

    if (event.result !== KILL_NUMBER) {
      ui.setGoOutWindow(true)
      setTimeout(() => ui.setGoOutWindow(false), DICE_ANIMATION_MS + GO_OUT_WINDOW_MS)
    }
  })

  socket.on('player_went_out', ({ playerId, displayName, lockedScore }) => {
    set((s) => {
      if (!s.room) return s
      return {
        room: {
          ...s.room,
          players: s.room.players.map((p) =>
            p.id === playerId ? { ...p, isIn: false, roundScore: lockedScore } : p,
          ),
        },
      }
    })
    useUiStore.getState().addToast(`${displayName} went out!`)
    useUiStore.getState().setGoOutWindow(false)
  })

  socket.on('round_ended', ({ scores }) => {
    set((s) => {
      if (!s.room) return s
      return {
        room: {
          ...s.room,
          players: s.room.players.map((p) => ({
            ...p,
            roundScore: scores[p.id] ?? p.roundScore,
            isIn: true,
          })),
        },
      }
    })
    useUiStore.getState().setGoOutWindow(false)
  })

  socket.on('phase_ended', ({ phase, scores }) => {
    set((s) => {
      if (!s.room) return s
      return {
        room: {
          ...s.room,
          players: s.room.players.map((p) => {
            const phaseScore = scores[p.id] ?? 0
            const newPhaseScores = [...p.phaseScores]
            newPhaseScores[phase - 1] = phaseScore
            return { ...p, phaseScores: newPhaseScores, totalScore: p.totalScore + phaseScore }
          }),
        },
      }
    })
  })

  socket.on('game_ended', ({ finalScores, winnerId }) => {
    set((s) => {
      if (!s.room) return s
      return {
        room: {
          ...s.room,
          status: 'finished',
          hostId: winnerId,
          players: s.room.players.map((p) => ({
            ...p,
            totalScore: finalScores[p.id] ?? p.totalScore,
          })),
        },
      }
    })
  })

  socket.on('turn_changed', ({ turnIndex }) => {
    set((s) => {
      if (!s.room) return s
      return { room: { ...s.room, turnIndex } }
    })
  })

  socket.on('host_changed', (newHostId: string) => {
    set((s) => {
      if (!s.room) return s
      return { room: { ...s.room, hostId: newHostId } }
    })
  })

  socket.on('chat_message', (msg: ChatMessage) => {
    set((s) => {
      const msgs = [...s.chatMessages, msg]
      return { chatMessages: msgs.length > 200 ? msgs.slice(-200) : msgs }
    })
  })

  socket.on('error', (msg: string) => {
    useUiStore.getState().setError(msg)
    setTimeout(() => useUiStore.getState().setError(null), 4000)
  })

  // ── initial state & actions ─────────────────────────────────────────────

  return {
    connected: false,
    myPlayerId: null,
    room: null,
    chatMessages: [],

    createRoom: (displayName) => {
      socket.emit('create_room', displayName)
    },

    joinRoom: (code, displayName) => {
      socket.emit('join_room', { code, displayName })
    },

    startGame: () => {
      socket.emit('start_game')
    },

    rollDice: () => {
      socket.emit('roll_dice')
    },

    goOut: () => {
      socket.emit('go_out')
      useUiStore.getState().setGoOutWindow(false)
    },

    sendChat: (text, type) => {
      socket.emit('send_chat', { text, type })
    },
  }
})

// convenience selector hooks
export const useRoom = () => useGameStore((s) => s.room)
export const useMyPlayerId = () => useGameStore((s) => s.myPlayerId)
export const useChatMessages = () => useGameStore((s) => s.chatMessages)
export const useConnected = () => useGameStore((s) => s.connected)
