import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import { createDefaultOutputSettings } from "@/editor-core/model";
import { detectRuntimeSupport } from "@/editor-core/runtime-capabilities";
import {
	PreviewAudioMonitoringProvider,
	usePreviewAudioMonitoring,
} from "@/editor-next/audio/engine/preview-audio-monitoring-provider";
import { AudioPanel } from "@/editor-next/audio/panel/audio-panel";
import { ExportInspectorPanel } from "@/editor-next/export/inspector/export-inspector";
import { MediaAssetContextPanel } from "@/editor-next/media-asset/panel/media-asset-context";
import { PreviewTransportRegion } from "@/editor-next/preview/regions/preview-transport-region";
import { EditorWorkbenchLayout } from "@/editor-next/workbench/frame/editor-workbench-layout";
import {
	type WorkbenchInspectorTabValue,
	WorkbenchInspectorTabs,
} from "@/editor-next/workbench/frame/workbench-inspector";
import { CircleDot, Maximize2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Inspector } from "./inspector";
import { MediaLibrary } from "./media-library";
import { FRAME, time } from "./model";
import { SequenceTimeline } from "./sequence-timeline";
import { shellAsset } from "./shell-asset";
import { TimelineFooter, TimelineToolbar } from "./timeline-controls";
import type { Editor } from "./use-editor";
import { ProgramMonitor } from "./viewers";

export function Workbench({ editor }: { editor: Editor }) {
	return (
		<PreviewAudioMonitoringProvider assetId="nle-sequence">
			<ExistingShell editor={editor} />
		</PreviewAudioMonitoringProvider>
	);
}
function ExistingShell({ editor }: { editor: Editor }) {
	const preview = useRef<HTMLDivElement>(null);
	const [activeTab, setTab] = useState<WorkbenchInspectorTabValue>("media");
	const [mediaOpen, setMediaOpen] = useState(false);
	const [propertiesOpen, setPropertiesOpen] = useState(false);
	const [closed, setClosed] = useState(false);
	const [outputSettings, setOutputSettings] = useState(
		createDefaultOutputSettings,
	);
	const [channelModes, setChannelModes] = useState(
		createDefaultAudioMix(shellAsset),
	);
	const { soloedAudioTrackId } = usePreviewAudioMonitoring();
	const asset = useMemo(
		() => ({ ...shellAsset, durationUs: editor.total }),
		[editor.total],
	);
	const mix = {
		...channelModes,
		tracks: Object.fromEntries(
			editor.state.tracks
				.filter((t) => t.kind === "audio")
				.map((t) => [
					t.id,
					{
						...channelModes.tracks[t.id],
						trackId: t.id,
						include: !t.muted,
						volumePercent: Math.round(t.gain * 100),
						channelMode: channelModes.tracks[t.id]?.channelMode ?? "preserve",
					},
				]),
		),
	};
	const selection = { startUs: 0, endUs: editor.total };
	const noop = () => {};
	if (closed)
		return (
			<main className="workbench dark cinema-workbench">
				<div className="prototype-reopen">
					<p>No media loaded</p>
					<button type="button" onClick={() => setClosed(false)}>
						Reopen sample sequence
					</button>
				</div>
			</main>
		);
	return (
		<main className="workbench dark cinema-workbench timeline-prototype-shell">
			<div className="cinema-stage" data-editing="true">
				<section className="cinema-session">
					<EditorWorkbenchLayout
						viewer={
							<div className="existing-preview" ref={preview}>
								<div className="existing-preview-heading">
									<span>
										<CircleDot size={12} />
										{editor.speed}x
									</span>
									<code>{time(editor.playhead)}</code>
									<button
										type="button"
										aria-label="Open fullscreen preview"
										onClick={() => {
											const stage =
												preview.current?.querySelector(".program-stage");
											void stage
												?.requestFullscreen()
												.catch(() =>
													editor.setMessage(
														"Fullscreen is unavailable in this browser",
													),
												);
										}}
									>
										<Maximize2 size={14} />
									</button>
								</div>
								<div className="nle preview-adapter">
									<ProgramMonitor
										editor={
											soloedAudioTrackId
												? {
														...editor,
														state: {
															...editor.state,
															tracks: editor.state.tracks.map((t) =>
																t.kind === "audio"
																	? { ...t, solo: t.id === soloedAudioTrackId }
																	: t,
															),
														},
													}
												: editor
										}
									/>
								</div>
							</div>
						}
						transport={
							<PreviewTransportRegion
								isPlaying={editor.playing}
								muted={editor.muted}
								onPlaybackRateChange={editor.setSpeed}
								onSeekByUs={(delta) => editor.seek(editor.playhead + delta)}
								onStepFrame={(d) => editor.seek(editor.playhead + d * FRAME)}
								onToggleMuted={() => editor.setMuted(!editor.muted)}
								onTogglePlayback={editor.togglePlayback}
								onToggleSelectionLoop={() => editor.setLoop(!editor.loop)}
								onVolumeChange={editor.setMasterGain}
								playbackRate={editor.speed}
								selectionLoopEnabled={editor.loop}
								volume={editor.masterGain}
							/>
						}
						inspector={
							<WorkbenchInspectorTabs
								activeTab={activeTab}
								onTabChange={setTab}
								mediaAssetContext={
									<MediaAssetContextPanel
										asset={asset}
										closeFileDisabled={false}
										onCloseFileRequested={() => {
											editor.setPlaying(false);
											setClosed(true);
										}}
										selection={selection}
									/>
								}
								audioPanel={
									<AudioPanel
										asset={asset}
										audioMix={mix}
										onAudioTrackIncludedChange={(id, include) =>
											editor.patchTrack(id, { muted: !include })
										}
										onAudioTrackVolumePercentChange={(id, value) =>
											editor.patchTrack(id, { gain: value / 100 })
										}
										onAudioTrackChannelModeChange={(id, channelMode) =>
											setChannelModes((m) => ({
												...m,
												tracks: {
													...m.tracks,
													[id]: { ...m.tracks[id], channelMode },
												},
											}))
										}
									/>
								}
								exportInspector={
									<div>
										<p className="px-2 py-2 text-xs text-muted-foreground">
											Export is shown for context. Sequence rendering is outside
											this timeline prototype.
										</p>
										<fieldset disabled>
											<ExportInspectorPanel
												asset={asset}
												audioMix={mix}
												exportState={{ status: "reviewing" }}
												onCancelExport={noop}
												onDownloadGeneratedMedia={noop}
												onApplyOutputSettings={setOutputSettings}
												onStartExport={noop}
												outputSettings={outputSettings}
												runtime={detectRuntimeSupport()}
												selection={selection}
											/>
										</fieldset>
									</div>
								}
							/>
						}
						selection={
							<div className="nle timeline-only">
								{mediaOpen && (
									<dialog
										className="timeline-popover"
										ref={(node) => node?.showModal()}
										onCancel={() => setMediaOpen(false)}
									>
										<button
											className="popover-close"
											type="button"
											onClick={() => setMediaOpen(false)}
										>
											Close
										</button>
										<MediaLibrary editor={editor} />
										<button
											type="button"
											className="insert-source"
											onClick={() => {
												editor.addAsset(editor.source, "insert");
												setMediaOpen(false);
											}}
										>
											Insert {editor.source.name}
										</button>
									</dialog>
								)}
								{propertiesOpen && (
									<dialog
										className="timeline-popover clip-popover"
										ref={(node) => node?.showModal()}
										onCancel={() => setPropertiesOpen(false)}
									>
										<button
											className="popover-close"
											type="button"
											onClick={() => setPropertiesOpen(false)}
										>
											Close
										</button>
										<Inspector editor={editor} />
									</dialog>
								)}
								<SequenceTimeline
									editor={editor}
									toolbar={
										<TimelineToolbar
											editor={editor}
											openMedia={() => {
												setMediaOpen(true);
												setPropertiesOpen(false);
											}}
											openProperties={() => {
												setPropertiesOpen(true);
												setMediaOpen(false);
											}}
										/>
									}
								/>
								<TimelineFooter editor={editor} />
							</div>
						}
					/>
				</section>
			</div>
		</main>
	);
}
