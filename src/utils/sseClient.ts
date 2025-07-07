// SSE client utility for progress tracking
const SSE_BASE_URL = 'http://localhost:3001/api/sse'

export type SSEProgressData = {
  type: 'connected' | 'progress' | 'completed'
  progressId: string
  progress?: number
  message?: string
  speed?: number
  timestamp: number
  completed?: boolean
  result?: unknown
  error?: string
}

export type SSEOptions = {
  progressId: string
  onProgress?: (progress: number, message: string, speed?: number) => void
  onComplete?: (result: unknown) => void
  onError?: (error: string) => void
  onConnected?: () => void
}

export class SSEProgressClient {
  private eventSource: EventSource | null = null
  private options: SSEOptions
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private reconnectDelay = 1000 // Start with 1 second

  constructor(options: SSEOptions) {
    this.options = options
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.eventSource) {
        this.disconnect()
      }

      const url = `${SSE_BASE_URL}/progress/${this.options.progressId}`
      console.log(`🔗 Connecting to SSE: ${url}`)

      this.eventSource = new EventSource(url)

      // Connection opened
      this.eventSource.onopen = () => {
        console.log(`✅ SSE connection opened for: ${this.options.progressId}`)
        this.isConnected = true
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.options.onConnected?.()
        resolve()
      }

      // Message received
      this.eventSource.onmessage = (event) => {
        try {
          const data: SSEProgressData = JSON.parse(event.data)
                     console.log('📡 SSE message received:', data)

          switch (data.type) {
            case 'connected':
              // Initial connection confirmation
              break

            case 'progress':
              if (data.progress !== undefined && data.message) {
                this.options.onProgress?.(data.progress, data.message, data.speed)
              }
              break

            case 'completed':
              if (data.error) {
                this.options.onError?.(data.error)
              } else if (data.result) {
                this.options.onComplete?.(data.result)
              } else {
                this.options.onError?.('Download completed but no result available')
              }
              this.disconnect()
              break

            default:
              console.warn('Unknown SSE message type:', data.type)
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error)
        }
      }

      // Connection error
      this.eventSource.onerror = (error) => {
        console.error(`❌ SSE connection error for ${this.options.progressId}:`, error)
        this.isConnected = false

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          // Connection closed by server
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect()
          } else {
            console.error('❌ Max reconnection attempts reached, giving up')
            this.options.onError?.('Connection lost and reconnection failed')
            reject(new Error('SSE connection failed after multiple attempts'))
          }
        }
      }

      // Set a timeout for initial connection
      setTimeout(() => {
        if (!this.isConnected) {
          console.error('❌ SSE connection timeout')
          this.disconnect()
          reject(new Error('SSE connection timeout'))
        }
      }, 10000) // 10 second timeout
    })
  }

  private attemptReconnect() {
    this.reconnectAttempts++
    console.log(`🔄 Attempting SSE reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`)

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
      })
    }, this.reconnectDelay)

    // Exponential backoff for reconnection delay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000) // Max 10 seconds
  }

  disconnect() {
    if (this.eventSource) {
      console.log(`🔌 Disconnecting SSE for: ${this.options.progressId}`)
      this.eventSource.close()
      this.eventSource = null
      this.isConnected = false
    }
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.eventSource?.readyState === EventSource.OPEN
  }
}

// Helper function to create and manage SSE connection for progress tracking
export const createSSEProgressTracker = (
  progressId: string,
  onProgress?: (progress: number, message: string, speed?: number) => void
): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const sseClient = new SSEProgressClient({
      progressId,
      onProgress,
      onComplete: (result) => {
        console.log('✅ SSE progress completed')
        resolve(result)
      },
      onError: (error) => {
        console.error('❌ SSE progress error:', error)
        reject(new Error(error))
      },
      onConnected: () => {
        console.log('🔗 SSE progress tracker connected')
      }
    })

    // Start the connection
    sseClient.connect().catch(error => {
      console.error('Failed to establish SSE connection:', error)
      reject(error)
    })

    // Set maximum tracking time (5 minutes)
    setTimeout(() => {
      if (sseClient.isConnectionActive()) {
        sseClient.disconnect()
        reject(new Error('Progress tracking timeout - operation took too long'))
      }
    }, 5 * 60 * 1000) // 5 minutes
  })
} 