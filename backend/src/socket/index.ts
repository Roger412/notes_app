import { Server, Socket } from 'socket.io'
import type { ButtonPressEvent } from '@notes-app/shared'

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Connected: ${socket.id}`)

    socket.on('controller:join', (roomId: string) => {
      socket.join(`controller:${roomId}`)
      io.to(`controller:${roomId}`).emit('controller:connected', socket.id)
      console.log(`${socket.id} joined controller:${roomId}`)
    })

    socket.on('controller:leave', (roomId: string) => {
      socket.leave(`controller:${roomId}`)
      io.to(`controller:${roomId}`).emit('controller:disconnected', socket.id)
    })

    // Phone sends button events — broadcast to everyone else in the same room
    socket.on('controller:button', (event: ButtonPressEvent) => {
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('controller:'))
      rooms.forEach(room => socket.to(room).emit('controller:button', event))
    })

    socket.on('disconnect', () => {
      console.log(`Disconnected: ${socket.id}`)
    })
  })
}
