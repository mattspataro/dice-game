import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

interface GoOutButtonProps {
  canGoOut: boolean
}

export default function GoOutButton({ canGoOut }: GoOutButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const goOut = useGameStore((s) => s.goOut)

  // Reset confirm state when window closes
  useEffect(() => {
    if (!canGoOut) setConfirming(false)
  }, [canGoOut])

  // Auto-reset after 3s of no second tap
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  if (!canGoOut) return null

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
    } else {
      goOut()
      setConfirming(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={[
        'flex-1 min-h-[52px] rounded-xl font-semibold text-sm transition-colors',
        confirming
          ? 'bg-orange-500 hover:bg-orange-400 text-white'
          : 'bg-gray-700 hover:bg-gray-600 text-white',
      ].join(' ')}
    >
      {confirming ? 'Confirm Go Out' : 'Go Out'}
    </button>
  )
}
