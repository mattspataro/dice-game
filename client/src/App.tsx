import { useUiStore } from './store/uiStore'
// Import gameStore to ensure socket listeners are registered on app start
import './store/gameStore'
import HomeScreen from './screens/HomeScreen'
import LobbyScreen from './screens/LobbyScreen'
import GameScreen from './screens/GameScreen'
import Toast from './components/Toast'

export default function App() {
  const screen = useUiStore((s) => s.screen)
  const error = useUiStore((s) => s.error)
  const toasts = useUiStore((s) => s.toasts)
  const removeToast = useUiStore((s) => s.removeToast)

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      {error && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm font-medium px-4 py-3 text-center">
          {error}
        </div>
      )}

      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 items-center pointer-events-none w-full px-4">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      {screen === 'home' && <HomeScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && <GameScreen />}
    </div>
  )
}
