import { CODECS } from '../../constants/quality-modal.constants'
import type { SectionProps } from '../../types/quality-modal.types'
import { Badge } from '../ui/badge'

export function CodecSection({ settings, onSettingsChange }: SectionProps) {
  const handleCodecChange = (codec: string) => {
    onSettingsChange({
      section: 'codec',
      field: 'codec',
      value: codec
    })
  }

  const renderCodecSection = (
    title: string,
    color: string,
    codecs: Array<{ key: string; label: string; description: string; experimental?: boolean }>,
    gridCols = 'grid-cols-1 sm:grid-cols-2'
  ) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <div className={`grid ${gridCols} gap-2 pl-4`}>
        {codecs.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => handleCodecChange(option.key)}
            className={`p-3 rounded-lg border text-left transition-colors ${
              settings.codec === option.key 
              ? 'border-primary bg-primary/5 ring-1 ring-primary' 
              : 'border-muted hover:border-border hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{option.label}</span>
                {option.experimental && (
                  <Badge variant="outline" className="text-xs">
                    Experimental
                  </Badge>
                )}
              </div>
              {settings.codec === option.key && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Codec & Container</div>
      
      <div className="space-y-4">
        {/* MP4 */}
        {renderCodecSection(
          'MP4',
          'bg-blue-500',
          [
            { key: 'h264_mp4', ...CODECS.h264_mp4 },
            { key: 'h265_mp4', ...CODECS.h265_mp4 }
          ]
        )}

        {/* WebM */}
        {renderCodecSection(
          'WebM',
          'bg-green-500',
          [
            { key: 'vp8_webm', ...CODECS.vp8_webm },
            { key: 'vp9_webm', ...CODECS.vp9_webm }
          ]
        )}

        {/* MOV */}
        {renderCodecSection(
          'MOV',
          'bg-purple-500',
          [
            { key: 'h264_mov', ...CODECS.h264_mov },
            { key: 'h265_mov', ...CODECS.h265_mov },
            { key: 'prores_mov', ...CODECS.prores_mov }
          ],
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        )}

        {/* Experimental */}
        {renderCodecSection(
          'Experimental',
          'bg-amber-500',
          [{ key: 'av1', ...CODECS.av1 }],
          'grid-cols-1'
        )}
      </div>
    </div>
  )
} 