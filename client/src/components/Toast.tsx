interface ToastProps {
  message: string
  onClose: () => void
}

export default function Toast({ message, onClose }: ToastProps) {
  return (
    <div className="toast-enter bg-gray-800 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-auto flex items-center gap-3">
      <span>{message}</span>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-white transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  )
}
