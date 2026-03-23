import { io, Socket } from 'socket.io-client'
import type { ServerEvents, ClientEvents } from '@shared/types'

type TypedSocket = Socket<ServerEvents, ClientEvents>

// Singleton — connect to same origin; Vite proxies /socket.io → :3001 in dev
const socket: TypedSocket = io({
  autoConnect: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
})

export default socket
