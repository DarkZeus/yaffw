import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { ensureDirectoryExists } from './utils/fileUtils.js'
import uploadRoutes from './routes/upload.js'
import videoRoutes from './routes/video.js'
import cleanupRoutes from './routes/cleanup.js'

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

const port = 3001
console.log(`Video processing server running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
