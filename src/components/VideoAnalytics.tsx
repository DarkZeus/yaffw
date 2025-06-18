import { Clock, FileVideo, HardDrive, Info, Monitor, Ratio, Settings, Volume2, VolumeX, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'

type VideoAnalyticsProps = {
  file: File
  duration: number
  videoMetadata?: {
    width?: number
    height?: number
    bitrate?: number
    codec?: string
    fps?: number
    audioCodec?: string
    audioBitrate?: number
    audioChannels?: number
    audioSampleRate?: number
    hasAudio?: boolean
    aspectRatio?: string
    pixelFormat?: string
    profile?: string
  }
}

export function VideoAnalytics({ file, duration, videoMetadata }: VideoAnalyticsProps) {
  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${Math.round((bytes / (1024 ** i)) * 100) / 100} ${sizes[i]}`
  }

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`
    }
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(0)} Kbps`
    }
    return `${bitrate} bps`
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const getResolutionCategory = (width?: number, height?: number) => {
    if (!width || !height) return 'Unknown'
    
    if (width >= 3840 && height >= 2160) return '4K UHD'
    if (width >= 2560 && height >= 1440) return '2K QHD'
    if (width >= 1920 && height >= 1080) return 'Full HD'
    if (width >= 1280 && height >= 720) return 'HD'
    if (width >= 854 && height >= 480) return 'SD'
    return 'Low Resolution'
  }

  const getQualityInfo = (bitrate?: number) => {
    if (!bitrate) return { label: 'Unknown', variant: 'secondary' as const }
    
    if (bitrate >= 10000000) return { label: 'Excellent', variant: 'default' as const }
    if (bitrate >= 5000000) return { label: 'High', variant: 'default' as const }
    if (bitrate >= 2000000) return { label: 'Medium', variant: 'outline' as const }
    if (bitrate >= 1000000) return { label: 'Low', variant: 'outline' as const }
    return { label: 'Very Low', variant: 'destructive' as const }
  }

  const getAudioQualityInfo = (bitrate?: number) => {
    if (!bitrate) return { label: 'Unknown', variant: 'secondary' as const }
    
    // Convert to Kbps if the value seems to be in bps (greater than 1000)
    const bitrateKbps = bitrate > 1000 ? bitrate / 1000 : bitrate
    
    if (bitrateKbps >= 320) return { label: 'Excellent', variant: 'default' as const }
    if (bitrateKbps >= 192) return { label: 'High', variant: 'default' as const }
    if (bitrateKbps >= 128) return { label: 'Good', variant: 'outline' as const }
    if (bitrateKbps >= 96) return { label: 'Fair', variant: 'outline' as const }
    if (bitrateKbps >= 64) return { label: 'Low', variant: 'destructive' as const }
    return { label: 'Very Low', variant: 'destructive' as const }
  }

  const estimatedBitrate = Math.round((file.size * 8) / duration)
  const qualityInfo = getQualityInfo(videoMetadata?.bitrate || estimatedBitrate)
  const audioQualityInfo = getAudioQualityInfo(videoMetadata?.audioBitrate)

  return (
    <div className="space-y-4">
      {/* File Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileVideo className="h-4 w-4" />
            File Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-mono truncate max-w-32" title={file.name}>
              {file.name.split('.').slice(0, -1).join('.')}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Size</span>
            <Badge variant="outline" className="font-mono">
              {formatFileSize(file.size)}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            <Badge variant="secondary" className="font-mono">
              {file.type.split('/')[1]?.toUpperCase() || 'Unknown'}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Duration
            </span>
            <Badge variant="outline" className="font-mono">
              {formatDuration(duration)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Video Properties */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Video Track
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Resolution</span>
            <div className="text-right space-y-1">
              {videoMetadata?.width && videoMetadata?.height ? (
                <>
                  <Badge variant="outline" className="font-mono">
                    {videoMetadata.width}×{videoMetadata.height}
                  </Badge>
                  <div>
                    <Badge variant="secondary" className="text-xs">
                      {getResolutionCategory(videoMetadata.width, videoMetadata.height)}
                    </Badge>
                  </div>
                </>
              ) : (
                <Badge variant="secondary">Analyzing...</Badge>
              )}
            </div>
          </div>

          {videoMetadata?.aspectRatio && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Ratio className="h-3 w-3" />
                Aspect Ratio
              </span>
              <Badge variant="outline" className="font-mono">
                {videoMetadata.aspectRatio}
              </Badge>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Bitrate</span>
            <div className="text-right space-y-1">
              <Badge variant="outline" className="font-mono">
                {formatBitrate(videoMetadata?.bitrate || estimatedBitrate)}
              </Badge>
              <div>
                <Badge variant={qualityInfo.variant} className="text-xs">
                  {qualityInfo.label}
                </Badge>
              </div>
            </div>
          </div>

          {videoMetadata?.fps && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Frame Rate</span>
              <Badge variant="outline" className="font-mono">
                {videoMetadata.fps} fps
              </Badge>
            </div>
          )}

          {videoMetadata?.codec && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Codec</span>
              <Badge variant="secondary" className="font-mono">
                {videoMetadata.codec.toUpperCase()}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audio Properties */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {videoMetadata?.hasAudio !== false ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
            Audio Track
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={videoMetadata?.hasAudio !== false ? "default" : "destructive"}>
              {videoMetadata?.hasAudio !== false ? 'Present' : 'None'}
            </Badge>
          </div>

          {videoMetadata?.hasAudio !== false && (
            <>
              {videoMetadata?.audioChannels && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Channels</span>
                  <Badge variant="outline" className="font-mono">
                    {videoMetadata.audioChannels === 1 ? 'Mono' : 
                     videoMetadata.audioChannels === 2 ? 'Stereo' : 
                     videoMetadata.audioChannels === 6 ? '5.1 Surround' :
                     videoMetadata.audioChannels === 8 ? '7.1 Surround' :
                     `${videoMetadata.audioChannels} Channel`}
                  </Badge>
                </div>
              )}

              {videoMetadata?.audioSampleRate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sample Rate</span>
                  <Badge variant="outline" className="font-mono">
                    {(videoMetadata.audioSampleRate / 1000).toFixed(1)} kHz
                  </Badge>
                </div>
              )}

              {videoMetadata?.audioBitrate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Bitrate</span>
                  <div className="text-right space-y-1">
                    <Badge variant="outline" className="font-mono">
                      {formatBitrate(videoMetadata.audioBitrate)}
                    </Badge>
                    <div>
                      <Badge variant={audioQualityInfo.variant} className="text-xs">
                        {audioQualityInfo.label}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {videoMetadata?.audioCodec && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Codec</span>
                  <Badge variant="secondary" className="font-mono">
                    {videoMetadata.audioCodec.toUpperCase()}
                  </Badge>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Technical Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Technical Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {videoMetadata?.pixelFormat && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pixel Format</span>
              <Badge variant="outline" className="font-mono">
                {videoMetadata.pixelFormat}
              </Badge>
            </div>
          )}

          {videoMetadata?.profile && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Profile</span>
              <Badge variant="outline" className="font-mono">
                {videoMetadata.profile}
              </Badge>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estimated Bitrate</span>
            <Badge variant="secondary" className="font-mono">
              {formatBitrate(estimatedBitrate)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 