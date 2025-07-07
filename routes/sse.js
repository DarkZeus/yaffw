import { Hono } from 'hono'

const sse = new Hono()

// Store active SSE connections
const sseConnections = new Map()

// Helper function to send SSE message
const sendSSEMessage = (response, data) => {
  const message = `data: ${JSON.stringify(data)}\n\n`
  response.write(message)
}

// SSE endpoint for progress updates
sse.get('/progress/:progressId', async (c) => {
  const progressId = c.req.param('progressId')
  
  if (!progressId) {
    return c.json({ error: 'Progress ID is required' }, 400)
  }

  console.log(`🔗 New SSE connection for progress: ${progressId}`)

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache')
  c.header('Connection', 'keep-alive')
  c.header('Access-Control-Allow-Origin', 'http://localhost:3000')
  c.header('Access-Control-Allow-Headers', 'Cache-Control')

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Store the controller so we can send messages later
      sseConnections.set(progressId, {
        controller,
        progressId,
        connected: true,
        startTime: Date.now()
      })

      // Send initial connection message
      const initialMessage = `data: ${JSON.stringify({
        type: 'connected',
        progressId,
        message: 'SSE connection established'
      })}\n\n`
      controller.enqueue(new TextEncoder().encode(initialMessage))

      console.log(`✅ SSE connection established for: ${progressId}`)
    },
    cancel() {
      // Clean up when client disconnects
      const connection = sseConnections.get(progressId)
      if (connection) {
        connection.connected = false
        sseConnections.delete(progressId)
        console.log(`🔌 SSE connection closed for: ${progressId}`)
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
})

// Function to broadcast progress to SSE clients
export const broadcastProgress = (progressId, progressData) => {
  const connection = sseConnections.get(progressId)
  
  if (connection && connection.connected) {
    try {
      const message = `data: ${JSON.stringify({
        type: 'progress',
        progressId,
        ...progressData,
        timestamp: Date.now()
      })}\n\n`
      
      connection.controller.enqueue(new TextEncoder().encode(message))
      console.log(`📡 SSE progress sent for ${progressId}: ${progressData.progress}% - ${progressData.message}`)
    } catch (error) {
      console.error(`❌ Failed to send SSE message for ${progressId}:`, error)
      // Mark connection as disconnected if sending fails
      connection.connected = false
      sseConnections.delete(progressId)
    }
  }
}

// Function to broadcast completion/error to SSE clients
export const broadcastCompletion = (progressId, resultData) => {
  const connection = sseConnections.get(progressId)
  
  if (connection && connection.connected) {
    try {
      const message = `data: ${JSON.stringify({
        type: 'completed',
        progressId,
        ...resultData,
        timestamp: Date.now()
      })}\n\n`
      
      connection.controller.enqueue(new TextEncoder().encode(message))
      console.log(`🏁 SSE completion sent for ${progressId}`)
      
      // Close the connection after sending completion
      setTimeout(() => {
        if (sseConnections.has(progressId)) {
          connection.controller.close()
          sseConnections.delete(progressId)
          console.log(`🔌 SSE connection auto-closed for completed: ${progressId}`)
        }
      }, 1000) // Give client time to receive the message
      
    } catch (error) {
      console.error(`❌ Failed to send SSE completion for ${progressId}:`, error)
      sseConnections.delete(progressId)
    }
  }
}

// Cleanup function for stale connections
const cleanupStaleConnections = () => {
  const now = Date.now()
  const staleThreshold = 10 * 60 * 1000 // 10 minutes
  
  for (const [progressId, connection] of sseConnections.entries()) {
    if (now - connection.startTime > staleThreshold) {
      console.log(`🧹 Cleaning up stale SSE connection: ${progressId}`)
      try {
        connection.controller.close()
      } catch (error) {
        // Ignore errors when closing stale connections
      }
      sseConnections.delete(progressId)
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleConnections, 5 * 60 * 1000)

export default sse 