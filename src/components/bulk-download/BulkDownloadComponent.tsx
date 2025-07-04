import { useBulkDownloadMediator } from '../../hooks/useBulkDownloadMediator'
import { SettingsDialog, SmartPasteDialog, ThumbnailModal } from './dialogs'
import { UrlInputSection, UrlListSection } from './sections'

export function BulkDownloadComponent() {
  const mediator = useBulkDownloadMediator()

  return (
    <div className="container mx-auto p-6 h-[calc(100dvh-1rem)] flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-2 flex-shrink-0">
        <h1 className="text-3xl font-bold">Bulk Download</h1>
        <p className="text-muted-foreground">
          Download multiple videos at once from various platforms directly to your computer
        </p>
      </div>

      {/* URL Input Section */}
      <div className="flex-shrink-0">
        <UrlInputSection
          currentUrl={mediator.currentUrl}
          setCurrentUrl={mediator.setCurrentUrl}
          handlePaste={mediator.handlePaste}
          onEvent={mediator.handleEvent}
          totalUrls={mediator.state.urls.length}
          selectedCount={mediator.selectedForDownload.length}
          completedCount={mediator.completedUrls.length}
          failedCount={mediator.failedUrls.length}
        />
      </div>

      {/* URL List Section */}
      <div className="flex-1 min-h-0">
        <UrlListSection
          urls={mediator.state.urls}
          allSelected={mediator.allSelected}
          selectedCount={mediator.selectedForDownload.length}
          canStartDownload={mediator.canStartDownload}
          isDownloading={mediator.state.isDownloading}
          completedUrls={mediator.completedUrls}
          failedUrls={mediator.failedUrls}
          onEvent={mediator.handleEvent}
          onShowSettings={() => mediator.setShowSettings(true)}
        />
      </div>

      {/* Smart Paste Dialog */}
      <SmartPasteDialog
        open={mediator.showSmartPasteDialog}
        onOpenChange={mediator.setShowSmartPasteDialog}
        detectedUrls={mediator.detectedUrls}
        selectedUrls={mediator.selectedUrls}
        onUrlToggle={mediator.handleSmartPasteUrlToggle}
        onEvent={mediator.handleEvent}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={mediator.showSettings}
        onOpenChange={mediator.setShowSettings}
        settings={mediator.state.settings}
        onEvent={mediator.handleEvent}
      />

      {/* Thumbnail Modal */}
      <ThumbnailModal
        open={mediator.showThumbnailModal}
        onOpenChange={mediator.setShowThumbnailModal}
        thumbnailUrl={mediator.thumbnailModalUrl}
        title={mediator.thumbnailModalTitle}
      />
    </div>
  )
} 