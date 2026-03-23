import { useRef, useEffect, useState } from 'react'
import { useGameStore, useChatMessages, useMyPlayerId } from '../store/gameStore'

export default function Chat() {
  const messages = useChatMessages()
  const myPlayerId = useMyPlayerId()
  const sendChat = useGameStore((s) => s.sendChat)
  const [text, setText] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isUserScrolled = useRef(false)

  useEffect(() => {
    if (!isUserScrolled.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    isUserScrolled.current = !atBottom
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    sendChat(trimmed, 'message')
    setText('')
    isUserScrolled.current = false
  }

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <span>Chat</span>
        <span>{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <>
          {/* Messages */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-40 overflow-y-auto px-4 py-2 space-y-1"
          >
            {messages.length === 0 && (
              <p className="text-gray-600 text-xs text-center py-4">No messages yet</p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2 items-start">
                <span
                  className="text-xs font-medium flex-shrink-0 mt-0.5"
                  style={{ color: msg.color }}
                >
                  {msg.playerId === myPlayerId ? 'You' : msg.displayName}:
                </span>
                <span
                  className={[
                    'text-gray-200 break-all',
                    msg.type === 'emoji' ? 'text-2xl leading-none' : 'text-xs',
                  ].join(' ')}
                >
                  {msg.text}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3 border-t border-gray-800">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say something..."
              maxLength={200}
              className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-w-0"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  )
}
