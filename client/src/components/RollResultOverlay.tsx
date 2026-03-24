import { useUiStore } from '../store/uiStore'

export default function RollResultOverlay() {
  const rollResult = useUiStore((s) => s.rollResult)

  if (!rollResult) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-fade-in">
      <span
        className={[
          'text-9xl font-black drop-shadow-2xl select-none',
          rollResult.isKill ? 'text-red-400' : 'text-white',
        ].join(' ')}
        style={{ textShadow: rollResult.isKill ? '0 0 40px rgba(239,68,68,0.8)' : '0 0 40px rgba(255,255,255,0.6)' }}
      >
        {rollResult.value}
      </span>
    </div>
  )
}
