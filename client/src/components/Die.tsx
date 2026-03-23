// Pip positions for each die face (using a 3x3 grid: positions 1-9)
// Grid layout:
// 1 2 3
// 4 5 6
// 7 8 9
const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

function DieFace({ value }: { value: number }) {
  const activePips = PIP_MAP[value] ?? []
  return (
    <div className="grid grid-cols-3 gap-1.5 p-3 w-full h-full">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((pos) => (
        <div key={pos} className="flex items-center justify-center">
          {activePips.includes(pos) && (
            <div className="w-4 h-4 rounded-full bg-gray-900" />
          )}
        </div>
      ))}
    </div>
  )
}

interface DieProps {
  value: number | null
  isRolling: boolean
  isKill: boolean
}

export default function Die({ value, isRolling, isKill }: DieProps) {
  return (
    <div
      className={[
        'w-36 h-36 rounded-2xl shadow-2xl flex items-center justify-center',
        isKill
          ? 'bg-red-500 die-kill ring-4 ring-red-400'
          : 'bg-white',
        isRolling ? 'die-rolling' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {value !== null ? (
        <DieFace value={value} />
      ) : (
        <span className="text-gray-300 text-4xl font-light">?</span>
      )}
    </div>
  )
}
