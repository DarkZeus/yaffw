import { Clock, Shield, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cleanupCookieSession, uploadTwitterCookieFile } from '../../../utils/urlDownloader'
import { Alert, AlertDescription } from '../../ui/alert'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog'
import { Input } from '../../ui/input'

type CookieSession = {
  sessionId: string
  originalName: string
  uploadTime: number
  used: boolean
}

type CookieManagementDialogProps = {
  isOpen: boolean
  onClose: () => void
  onCookieUploaded?: (sessionId: string) => void
}

export function CookieManagementDialog({ isOpen, onClose, onCookieUploaded }: CookieManagementDialogProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [cookieSessions, setCookieSessions] = useState<CookieSession[]>([])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.txt')) {
      toast.error('Please select a .txt file')
      return
    }

    setIsUploading(true)
    
    try {
      const response = await uploadTwitterCookieFile(file)
      
      const newSession: CookieSession = {
        sessionId: response.sessionId,
        originalName: file.name,
        uploadTime: Date.now(),
        used: false
      }
      
      setCookieSessions(prev => [...prev, newSession])
      
      toast.success('Cookie file uploaded successfully')
      
      if (onCookieUploaded) {
        onCookieUploaded(response.sessionId)
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload cookie file'
      toast.error(`Upload failed: ${errorMessage}`)
    } finally {
      setIsUploading(false)
      // Reset the input
      event.target.value = ''
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await cleanupCookieSession(sessionId)
      setCookieSessions(prev => prev.filter(session => session.sessionId !== sessionId))
      toast.success('Cookie file deleted successfully')
    } catch (error) {
      toast.error('Failed to delete cookie file')
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now()
    const diffMinutes = Math.floor((now - timestamp) / (1000 * 60))
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Cookie File Management
          </DialogTitle>
          <DialogDescription>
            Upload Twitter cookie files to access age-restricted or private content
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Privacy Information */}
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Privacy & Security Information:</strong>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Cookie files are stored temporarily and automatically deleted after use</li>
                <li>• Files are automatically removed after 1 hour even if unused</li>
                <li>• No cookies are stored permanently on our servers</li>
                <li>• Only use cookie files from your own Twitter account</li>
                <li>• Never share cookie files with others</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Cookie File
              </CardTitle>
              <CardDescription>
                Select a Netscape format cookie file (.txt) exported from your browser
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="cursor-pointer"
                />
                
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>How to export cookies:</strong></p>
                  <p>1. Install a browser extension like "Get cookies.txt" or "cookies.txt"</p>
                  <p>2. Visit Twitter/X.com while logged in</p>
                  <p>3. Export cookies in Netscape format</p>
                  <p>4. Save as a .txt file and upload here</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          {cookieSessions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Active Cookie Sessions
                </CardTitle>
                <CardDescription>
                  Manage your uploaded cookie files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {cookieSessions.map(session => (
                    <div key={session.sessionId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{session.originalName}</span>
                          {session.used && (
                            <Badge variant="secondary" className="text-xs">Used</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Uploaded {getTimeAgo(session.uploadTime)} • {formatTime(session.uploadTime)}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSession(session.sessionId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 