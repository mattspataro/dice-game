import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'

type Mode = 'select' | 'create' | 'join'

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>('select')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const createRoom = useGameStore((s) => s.createRoom)
  const joinRoom = useGameStore((s) => s.joinRoom)
  const connected = useGameStore((s) => s.connected)
  const error = useUiStore((s) => s.error)

  const nameValid = displayName.trim().length > 0 && displayName.trim().length <= 20
  const codeValid = joinCode.trim().length === 6

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid) return
    createRoom(displayName.trim())
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid || !codeValid) return
    joinRoom(joinCode.trim().toUpperCase(), displayName.trim())
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-2">🎲 Dice Game</h1>
          <p className="text-gray-400 text-sm">
            {connected ? 'Connected' : 'Connecting...'}
          </p>
        </div>

        {mode === 'select' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('create')}
              className="w-full min-h-[52px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl font-semibold text-lg transition-colors"
            >
              Create Room
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full min-h-[52px] bg-gray-700 hover:bg-gray-600 active:bg-gray-800 rounded-xl font-semibold text-lg transition-colors"
            >
              Join Room
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setMode('select')}
              className="text-gray-400 hover:text-white text-sm self-start transition-colors"
            >
              ← Back
            </button>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-base"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={!nameValid || !connected}
              className="w-full min-h-[52px] bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-colors"
            >
              Create Room
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setMode('select')}
              className="text-gray-400 hover:text-white text-sm self-start transition-colors"
            >
              ← Back
            </button>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Room code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                maxLength={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-base font-mono tracking-widest uppercase"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={!nameValid || !codeValid || !connected}
              className="w-full min-h-[52px] bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-colors"
            >
              Join Room
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
