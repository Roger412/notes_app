import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import notesRouter from './routes/notes'
import financeRouter from './routes/finance'
import { setupSocketHandlers } from './socket/index'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

app.use(cors({ origin: '*' }))
app.use(express.json())

app.get('/', (_req, res) => res.json({ name: 'notes-app backend', status: 'ok', version: '1.0.0' }))
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/notes', notesRouter)
app.use('/api/finance', financeRouter)

setupSocketHandlers(io)

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
