import { useEffect } from 'react'
import { useGameStore, useRoom, useMyPlayerId } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { useSound } from '../hooks/useSound'
import Die from '../components/Die'
import ScoreBar from '../components/ScoreBar'
import GoOutButton from '../components/GoOutButton'
import Chat from '../components/Chat'
import PhaseOverlay from '../components/PhaseOverlay'
import RollResultOverlay from '../components/RollResultOverlay'
import { KILL_NUMBER, NUM_PHASES, ROUNDS_PER_PHASE } from '@shared/constants'

export default function GameScreen() {
  const room = useRoom()
  const myPlayerId = useMyPlayerId()
  const rollDice = useGameStore((s) => s.rollDice)
  const lastRollEvent = useGameStore((s) => s.lastRollEvent)
  const winnerId = useGameStore((s) => s.winnerId)
  const isRolling = useUiStore((s) => s.isRolling)
  const goOutWindowOpen = useUiStore((s) => s.goOutWindowOpen)
  const showConfetti = useUiStore((s) => s.showConfetti)
  const soundMuted = useUiStore((s) => s.soundMuted)
  const toggleSound = useUiStore((s) => s.toggleSound)
  const { playScore, playKill, playGoOut, playGameEnd } = useSound()

  // Trigger confetti via canvas-confetti
  useEffect(() => {
    if (!showConfetti) return
    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({ particleCount: 200, spread: 120, origin: { y: 0.4 } })
      setTimeout(() => confetti({ particleCount: 100, spread: 80, origin: { y: 0.6, x: 0.1 } }), 400)
      setTimeout(() => confetti({ particleCount: 100, spread: 80, origin: { y: 0.6, x: 0.9 } }), 800)
    })
  }, [showConfetti])

  // Sound effects on roll
  useEffect(() => {
    if (!lastRollEvent) return
    if (lastRollEvent.result === KILL_NUMBER) {
      playKill()
    } else {
      playScore()
    }
  }, [lastRollEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sound on game end
  useEffect(() => {
    if (room?.status === 'finished') {
      playGameEnd()
    }
  }, [room?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!room) return null

  const currentPlayerId = room.turnOrder[room.turnIndex]
  const currentPlayer = room.players.find((p) => p.id === currentPlayerId)
  const me = room.players.find((p) => p.id === myPlayerId)

  const isMyTurn = currentPlayerId === myPlayerId
  const canRoll = isMyTurn && !isRolling && room.status === 'active' && (me?.isIn ?? false)
  const canGoOut = goOutWindowOpen && (me?.isIn ?? false) && !isRolling && !isMyTurn
  const isKill = room.lastRoll === KILL_NUMBER
  const lastEvent = room.rollHistory[room.rollHistory.length - 1]
  const seed = lastEvent?.seed ?? 0

  const isFinished = room.status === 'finished'
  // Use server-authoritative winnerId; fall back to local max for display only
  const winner = isFinished
    ? room.players.find((p) => p.id === winnerId) ??
      room.players.reduce((a, b) => (a.totalScore > b.totalScore ? a : b), room.players[0])
    : null

  return (
    <div className="min-h-dvh flex flex-col relative">
      <PhaseOverlay />

      {/* Sticky score bar */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800">
        <ScoreBar />
      </div>

      {/* Phase / round info + sound toggle */}
      <div className="relative flex items-center justify-center gap-6 px-4 py-3 text-sm">
        <span className="text-gray-400">
          Phase <span className="text-white font-bold">{room.phase}</span>/{NUM_PHASES}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">
          Round <span className="text-white font-bold">{room.round}</span>/{ROUNDS_PER_PHASE}
        </span>
        <button
          onClick={toggleSound}
          className="absolute right-4 text-gray-500 hover:text-white text-base transition-colors"
          title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Game over overlay */}
      {isFinished && winner && (
        <div className="mx-4 mb-4 bg-indigo-900 border border-indigo-600 rounded-2xl p-6 text-center">
          <p className="text-2xl font-bold mb-1">🏆 Game Over!</p>
          <p className="text-gray-300">
            <span style={{ color: winner.color }} className="font-bold">
              {winner.id === myPlayerId ? 'You win' : winner.displayName}
            </span>{' '}
            {winner.id === myPlayerId ? '🎉' : `wins`} with {winner.totalScore} points!
          </p>
          <div className="mt-4 space-y-1">
            {[...room.players]
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((p, i) => (
                <div key={p.id} className="flex justify-between text-sm px-2">
                  <span style={{ color: p.color }}>
                    {i + 1}. {p.displayName}
                  </span>
                  <span className="text-gray-300 font-mono">{p.totalScore}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Die */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-4">
        <div className="relative">
          <Die value={room.lastRoll} isRolling={isRolling} isKill={isKill} seed={seed} />
          <RollResultOverlay />
        </div>

        {/* Turn indicator */}
        {!isFinished && (
          <p className="text-center text-gray-300 text-sm">
            {isMyTurn
              ? me?.isIn
                ? "It's your turn!"
                : "You're out this round"
              : currentPlayer
                ? `It's ${currentPlayer.displayName}'s turn`
                : ''}
          </p>
        )}

        {/* Action buttons */}
        {!isFinished && (
          <div className="flex gap-3 w-full max-w-xs">
            <button
              onClick={rollDice}
              disabled={!canRoll}
              className="flex-1 min-h-[52px] bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl font-semibold text-base transition-colors"
            >
              {isRolling ? 'Rolling...' : 'Roll Dice'}
            </button>
            <GoOutButton canGoOut={canGoOut} onGoOut={playGoOut} />
          </div>
        )}

        {/* My current round score */}
        {!isFinished && me && (
          <div className="text-center">
            <p className="text-xs text-gray-500">Your round score</p>
            <p className="text-2xl font-bold" style={{ color: me.color }}>
              {me.roundScore}
            </p>
            {!me.isIn && (
              <p className="text-xs text-gray-400 mt-1">Locked in ✓</p>
            )}
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="px-4 pb-4">
        <Chat />
      </div>
    </div>
  )
}
