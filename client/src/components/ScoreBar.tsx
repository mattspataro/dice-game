import React from 'react'
import { useRoom, useMyPlayerId } from '../store/gameStore'

export default function ScoreBar() {
  const room = useRoom()
  const myPlayerId = useMyPlayerId()

  if (!room) return null

  const currentPlayerId = room.turnOrder[room.turnIndex]

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
      {room.players.map((p) => {
        const isCurrentTurn = p.id === currentPlayerId
        const isMe = p.id === myPlayerId
        return (
          <div
            key={p.id}
            className={[
              'flex-shrink-0 flex flex-col items-center rounded-xl px-3 py-2 min-w-[72px]',
              isCurrentTurn ? 'ring-2 bg-gray-800' : 'bg-gray-900',
            ].join(' ')}
            style={isCurrentTurn ? { '--tw-ring-color': p.color } as React.CSSProperties : undefined}
          >
            {/* Color dot + name */}
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-xs font-medium truncate max-w-[56px] text-gray-200">
                {isMe ? 'You' : p.displayName}
              </span>
            </div>

            {/* Round score */}
            <span
              className="text-sm font-bold"
              style={{ color: p.color }}
            >
              {p.roundScore}
            </span>

            {/* Status badges */}
            <div className="flex gap-1 mt-1">
              {!p.isIn && (
                <span className="text-xs text-gray-500">OUT</span>
              )}
              {p.id === room.hostId && (
                <span className="text-xs">👑</span>
              )}
              {!p.isConnected && (
                <span className="text-xs text-gray-600">·</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
