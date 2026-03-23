import { useState } from 'react'
import { useGameStore, useRoom, useMyPlayerId } from '../store/gameStore'
import { MIN_PLAYERS } from '@shared/constants'
import Chat from '../components/Chat'

export default function LobbyScreen() {
  const room = useRoom()
  const myPlayerId = useMyPlayerId()
  const startGame = useGameStore((s) => s.startGame)
  const [copied, setCopied] = useState(false)

  if (!room) return null

  const isHost = myPlayerId === room.hostId

  function copyCode() {
    navigator.clipboard.writeText(room!.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-center mb-6">Lobby</h1>

        {/* Room code */}
        <div className="bg-gray-800 rounded-2xl p-5 text-center mb-6">
          <p className="text-sm text-gray-400 mb-2">Room Code</p>
          <button
            onClick={copyCode}
            className="font-mono text-4xl font-bold tracking-widest text-white hover:text-indigo-300 transition-colors"
          >
            {room.code}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            {copied ? '✓ Copied!' : 'Tap to copy'}
          </p>
        </div>

        {/* Players */}
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">
            Players ({room.players.length}/{10})
          </p>
          <div className="flex flex-col gap-2">
            {room.players.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-medium flex-1">
                  {p.displayName}
                  {p.id === myPlayerId && (
                    <span className="text-gray-400 text-sm ml-2">(you)</span>
                  )}
                </span>
                {p.id === room.hostId && (
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                    Host
                  </span>
                )}
                {!p.isConnected && (
                  <span className="text-xs text-gray-500">disconnected</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Start button */}
        {isHost && (
          <button
            onClick={startGame}
            disabled={room.players.length < MIN_PLAYERS}
            className="w-full min-h-[52px] bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-colors mb-2"
          >
            Start Game
          </button>
        )}
        {isHost && room.players.length < MIN_PLAYERS && (
          <p className="text-center text-sm text-gray-500">
            Need at least {MIN_PLAYERS} players to start
          </p>
        )}
        {!isHost && (
          <p className="text-center text-sm text-gray-500">
            Waiting for host to start the game...
          </p>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 px-4 pb-4">
        <Chat />
      </div>
    </div>
  )
}
