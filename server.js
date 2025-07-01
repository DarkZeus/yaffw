import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { EventEmitter } from 'events'
import { ensureDirectoryExists } from './utils/fileUtils.js'
import uploadRoutes from './routes/upload.js'
import videoRoutes from './routes/video.js'
import cleanupRoutes from './routes/cleanup.js'
import downloadRoutes from './routes/download.js'
import waveformRoutes from './routes/waveform.js'

// Increase max listeners to prevent warnings
EventEmitter.defaultMaxListeners = 15

const app = new Hono()

// Enable CORS for frontend
app.use('/api/*', cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))

// Ensure uploads directory exists
ensureDirectoryExists('uploads')

// Mount route modules
app.route('/api', uploadRoutes)
app.route('/api', videoRoutes)
app.route('/api', cleanupRoutes)
app.route('/api/download', downloadRoutes)
app.route('/api', waveformRoutes)

const port = 3001
console.log(`Video processing server with chunked upload support running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
}) 