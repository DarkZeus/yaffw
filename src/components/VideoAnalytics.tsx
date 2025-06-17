import { Clock, FileVideo, HardDrive, Info, Monitor, Ratio, Settings, Volume2, VolumeX, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'

interface VideoAnalyticsProps {
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
    if (!bitrate) return { label: 'Unknown', color: 'text-gray-400', bgColor: 'bg-gray-500/20' }
    
    if (bitrate >= 10000000) return { label: 'Excellent', color: 'text-green-400', bgColor: 'bg-green-500/20' }
    if (bitrate >= 5000000) return { label: 'High', color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    if (bitrate >= 2000000) return { label: 'Medium', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' }
    if (bitrate >= 1000000) return { label: 'Low', color: 'text-orange-400', bgColor: 'bg-orange-500/20' }
    return { label: 'Very Low', color: 'text-red-400', bgColor: 'bg-red-500/20' }
  }

  const getAudioQualityInfo = (bitrate?: number) => {
    if (!bitrate) return { label: 'Unknown', color: 'text-gray-400' }
    
    // Convert to Kbps if the value seems to be in bps (greater than 1000)
    const bitrateKbps = bitrate > 1000 ? bitrate / 1000 : bitrate
    
    if (bitrateKbps >= 320) return { label: 'Excellent', color: 'text-green-400' }
    if (bitrateKbps >= 192) return { label: 'High', color: 'text-blue-400' }
    if (bitrateKbps >= 128) return { label: 'Good', color: 'text-yellow-400' }
    if (bitrateKbps >= 96) return { label: 'Fair', color: 'text-orange-400' }
    if (bitrateKbps >= 64) return { label: 'Low', color: 'text-red-400' }
    return { label: 'Very Low', color: 'text-red-500' }
  }

  const estimatedBitrate = Math.round((file.size * 8) / duration)
  const qualityInfo = getQualityInfo(videoMetadata?.bitrate || estimatedBitrate)
  const audioQualityInfo = getAudioQualityInfo(videoMetadata?.audioBitrate)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-400" />
        Video Analytics
      </h3>
      
      <div className="space-y-4 text-xs">
        {/* File Information */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-2">
            <FileVideo className="h-3 w-3" />
            File Info
          </h4>
          
          <div className="space-y-2 ml-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Name</span>
              <span className="text-slate-200 font-mono truncate max-w-24" title={file.name}>
                {file.name.split('.').slice(0, -1).join('.')}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Size</span>
              <span className="text-slate-200 font-mono">
                {formatFileSize(file.size)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Type</span>
              <span className="text-slate-200 font-mono">
                {file.type.split('/')[1]?.toUpperCase() || 'Unknown'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Duration</span>
              <span className="text-slate-200 font-mono">
                {formatDuration(duration)}
              </span>
            </div>
          </div>
        </div>

        <Separator className="bg-slate-700" />

        {/* Video Properties */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-2">
            <Monitor className="h-3 w-3" />
            Video Track
          </h4>
          
          <div className="space-y-2 ml-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Resolution</span>
              <div className="text-right">
                {videoMetadata?.width && videoMetadata?.height ? (
                  <>
                    <div className="text-slate-200 font-mono">
                      {videoMetadata.width}×{videoMetadata.height}
                    </div>
                    <div className="text-xs text-blue-400">
                      {getResolutionCategory(videoMetadata.width, videoMetadata.height)}
                    </div>
                  </>
                ) : (
                  <span className="text-slate-500">Analyzing...</span>
                )}
              </div>
            </div>

            {videoMetadata?.aspectRatio && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1">
                  <Ratio className="h-3 w-3" />
                  Aspect Ratio
                </span>
                <span className="text-slate-200 font-mono">
                  {videoMetadata.aspectRatio}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Bitrate</span>
              <div className="text-right">
                <div className="text-slate-200 font-mono">
                  {formatBitrate(videoMetadata?.bitrate || estimatedBitrate)}
                </div>
                <div className={`text-xs ${qualityInfo.color}`}>
                  {qualityInfo.label}
                </div>
              </div>
            </div>

            {videoMetadata?.fps && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Frame Rate</span>
                <span className="text-slate-200 font-mono">
                  {videoMetadata.fps} fps
                </span>
              </div>
            )}

            {videoMetadata?.codec && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Codec</span>
                <span className="text-indigo-400 font-mono">
                  {videoMetadata.codec.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-slate-700" />

        {/* Audio Properties */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-2">
            {videoMetadata?.hasAudio !== false ? (
              <Volume2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <VolumeX className="h-3 w-3 text-red-400" />
            )}
            Audio Track
          </h4>
          
          <div className="space-y-2 ml-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  videoMetadata?.hasAudio !== false ? 'bg-emerald-400' : 'bg-red-400'
                }`} />
                <span className={`text-xs ${
                  videoMetadata?.hasAudio !== false ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {videoMetadata?.hasAudio !== false ? 'Present' : 'None'}
                </span>
              </div>
            </div>

            {videoMetadata?.hasAudio !== false && (
              <>
                {videoMetadata?.audioChannels && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Channels</span>
                    <span className="text-slate-200 font-mono">
                      {videoMetadata.audioChannels === 1 ? 'Mono' : 
                       videoMetadata.audioChannels === 2 ? 'Stereo' : 
                       videoMetadata.audioChannels === 6 ? '5.1 Surround' :
                       videoMetadata.audioChannels === 8 ? '7.1 Surround' :
                       `${videoMetadata.audioChannels} Channel`}
                    </span>
                  </div>
                )}

                {videoMetadata?.audioBitrate && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bitrate</span>
                    <div className="text-right">
                      <div className="text-slate-200 font-mono">
                        {formatBitrate(videoMetadata.audioBitrate)}
                      </div>
                      <div className={`text-xs ${audioQualityInfo.color}`}>
                        {audioQualityInfo.label}
                      </div>
                    </div>
                  </div>
                )}

                {videoMetadata?.audioSampleRate && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Sample Rate</span>
                    <span className="text-slate-200 font-mono">
                      {(videoMetadata.audioSampleRate / 1000).toFixed(1)} kHz
                    </span>
                  </div>
                )}

                {videoMetadata?.audioCodec && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Codec</span>
                    <span className="text-emerald-400 font-mono">
                      {videoMetadata.audioCodec.toUpperCase()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Separator className="bg-slate-700" />

        {/* Overall Assessment */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-slate-300">Quality Assessment</h4>
          
          <div className="space-y-2 ml-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Video Quality</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${qualityInfo.color.replace('text-', 'bg-')}`} />
                <span className={`text-xs ${qualityInfo.color}`}>{qualityInfo.label}</span>
              </div>
            </div>

            {videoMetadata?.hasAudio !== false && videoMetadata?.audioBitrate && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Audio Quality</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${audioQualityInfo.color.replace('text-', 'bg-')}`} />
                  <span className={`text-xs ${audioQualityInfo.color}`}>{audioQualityInfo.label}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-400">File Efficiency</span>
              <span className="text-slate-200 font-mono text-xs">
                {((file.size / duration) / 1024).toFixed(1)} KB/s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 