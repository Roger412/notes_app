import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentUrl: string | null = null

export function connectSocket(url?: string): Socket {
  const targetUrl = url || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:4000'
  if (socket && currentUrl !== targetUrl) {
    socket.disconnect()
    socket = null
  }
  if (!socket) {
    currentUrl = targetUrl
    socket = io(targetUrl, { transports: ['polling', 'websocket'] })
  }
  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  currentUrl = null
}
