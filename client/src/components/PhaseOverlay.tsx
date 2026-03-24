import { useUiStore } from '../store/uiStore'

const PHASE_TITLES: Record<number, string> = {
  1: 'Phase 1',
  2: 'Phase 2',
  3: 'Phase 3',
  4: 'Phase 4 — Final Phase!',
}

const PHASE_RULES: Record<number, string> = {
  1: 'Face value only — 4 kills!',
  2: '5s are now worth 50 points',
  3: '1s = 100pts · 5s = 50pts',
  4: '2 doubles your entire round score!',
}

export default function PhaseOverlay() {
  const overlay = useUiStore((s) => s.phaseOverlay)

  if (!overlay?.active) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in">
      <div className="bg-gray-900 border border-indigo-500 rounded-3xl p-8 text-center max-w-xs mx-4 shadow-2xl">
        <p className="text-indigo-400 text-sm font-medium mb-2 uppercase tracking-widest">
          Next Phase
        </p>
        <p className="text-3xl font-bold mb-3">
          {PHASE_TITLES[overlay.phase] ?? `Phase ${overlay.phase}`}
        </p>
        <p className="text-gray-300 text-lg">
          {PHASE_RULES[overlay.phase] ?? ''}
        </p>
      </div>
    </div>
  )
}
