import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type SetupProgress = {
  progress: number
  message: string
}

type SetupError = {
  error: string
}

export function SetupDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const setupListeners = async () => {
      if (window.__TAURI__) {
        // Listen for setup progress events
        await window.__TAURI__.event.listen('setup_progress', (event: { payload: unknown }) => {
          const payload = event.payload as SetupProgress
          setIsOpen(true)
          setProgress(payload.progress)
          setMessage(payload.message)
          
          if (payload.progress === 100) {
            setIsComplete(true)
            // Auto-close after 2 seconds when complete
            setTimeout(() => {
              setIsOpen(false)
              setIsComplete(false)
              setProgress(0)
              setMessage('')
            }, 2000)
          }
        })

        // Listen for setup error events
        await window.__TAURI__.event.listen('setup_error', (event: { payload: unknown }) => {
          const payload = event.payload as SetupError
          setIsOpen(true)
          setError(payload.error)
        })
      }
    }

    setupListeners()
  }, [])

  const handleClose = () => {
    if (isComplete || error) {
      setIsOpen(false)
      setError(null)
      setIsComplete(false)
      setProgress(0)
      setMessage('')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {error ? (
              <>
                <AlertCircle className="h-5 w-5 text-red-500" />
                Setup Error
              </>
            ) : isComplete ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                Setup Complete
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Setting up YAFFW
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {error ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <div className="text-sm text-gray-600">
                Please ensure Node.js is installed and try restarting the application.
              </div>
              <Button onClick={handleClose} variant="outline" className="w-full">
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{message}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
              
              {isComplete ? (
                <div className="text-center">
                  <p className="text-sm text-green-600 mb-2">
                    YAFFW has been set up successfully!
                  </p>
                  <p className="text-xs text-gray-500">
                    This dialog will close automatically...
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    This is a one-time setup process. Please wait while we prepare YAFFW for first use.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 