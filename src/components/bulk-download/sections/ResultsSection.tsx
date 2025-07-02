import { CheckCircle2, RefreshCw } from 'lucide-react'
import type { ResultsSectionProps } from '../../../types/bulk-download-components.types'
import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs'

export function ResultsSection({ completedUrls, failedUrls, onEvent }: ResultsSectionProps) {
  if (completedUrls.length === 0 && failedUrls.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download Results</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="completed">
          <TabsList>
            <TabsTrigger value="completed">
              Completed ({completedUrls.length})
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed ({failedUrls.length})
            </TabsTrigger>
          </TabsList>
          
                      <TabsContent value="completed" className="space-y-3">
              {completedUrls.map((url) => (
                <div key={url.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    {url.thumbnail && (
                      <button
                        type="button"
                        onClick={() => onEvent({ 
                          type: 'THUMBNAIL_CLICKED', 
                          payload: { thumbnailUrl: url.thumbnail || '', title: url.title } 
                        })}
                        className="p-0 border-0 bg-transparent cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <img 
                          src={url.thumbnail} 
                          alt="Video thumbnail"
                          className="w-12 h-9 object-cover rounded border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </button>
                    )}
                    <div>
                      <p className="font-medium">{url.title}</p>
                      <p className="text-sm text-muted-foreground">{url.fileName}</p>
                    </div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
              ))}
          </TabsContent>
          
          <TabsContent value="failed" className="space-y-3">
            {failedUrls.map((url) => (
              <div key={url.id} className="p-3 border rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{url.title || url.url}</p>
                    <p className="text-sm text-red-500">{url.error}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
} 