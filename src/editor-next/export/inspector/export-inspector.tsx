import { BadgeCheck, Check, Download, Square } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	type ExportCapabilityReview,
	planDefaultExportCapability,
} from "@/editor-core/export-capability";
import type {
	AudioMix,
	ExportProgress,
	GeneratedMedia,
	OutputSettings,
	ReadyMediaAsset,
	ResolvedOutputPlan,
	Selection,
} from "@/editor-core/model";
import { formatOutputVideoCodec } from "@/editor-core/output-settings";
import {
	type ResolvedOutputAudioProfile,
	type ResolvedOutputResolution,
	formatOutputQualitySetting,
	resolveOutputAudioProfile,
	resolveOutputPlan,
	resolveOutputResolution,
} from "@/editor-core/output-settings";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportJob, ExportSessionState } from "@/editor-core/session";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../adapters/mediabunny-output-support";
import { OutputSettingsPanel } from "./output-settings-panel";

export type ExportInspectorPanelProps = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	exportState: ExportSessionState;
	onCancelExport: () => void;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => boolean;
	onApplyOutputSettings: (outputSettings: OutputSettings) => boolean;
	onStartExport: () => void;
	outputSettings: OutputSettings;
	runtime: RuntimeSupport;
	selection: Selection;
};

export function ExportInspectorPanel({
	asset,
	audioMix,
	exportState,
	onCancelExport,
	onDownloadGeneratedMedia,
	onApplyOutputSettings,
	onStartExport,
	outputSettings,
	runtime,
	selection,
}: ExportInspectorPanelProps) {
	const review = planDefaultExportCapability({
		asset,
		output: resolveOutputPlan({
			asset,
			audioMix,
			outputSettings,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		}),
		outputSettings,
		runtime,
		selection,
	});
	const outputAudio = resolveOutputAudioProfile({
		asset,
		audioMix,
		outputSettings,
		support: MEDIABUNNY_OUTPUT_SUPPORT,
	});
	const outputResolution = resolveOutputResolution({
		asset,
		setting: outputSettings.resolution,
	});

	return (
		<section
			aria-label="Export inspector"
			className="flex min-w-0 flex-col px-4 pb-6 md:px-1"
		>
			<div className="flex min-h-0 flex-1 flex-col gap-6">
				<ExportReviewSection
					hasAutomaticChannelMode={asset.tracks.audio.some((track) => {
						const decision = audioMix.tracks[track.id];
						return (
							outputSettings.audioCodec.kind !== "no-audio" &&
							decision?.include &&
							decision.channelMode === "auto-one-sided-stereo"
						);
					})}
					outputResolution={outputResolution}
					review={review}
					videoQuality={formatOutputQualitySetting(outputSettings.videoQuality)}
					audioQuality={
						outputSettings.audioCodec.kind === "no-audio"
							? "No audio"
							: formatOutputQualitySetting(outputSettings.audioQuality)
					}
				/>
				<OutputSettingsPanel
					asset={asset}
					audioMix={audioMix}
					exportRunning={exportState.status === "running"}
					onApplyOutputSettings={onApplyOutputSettings}
					outputSettings={outputSettings}
				/>
				<ExportJobSection
					exportState={exportState}
					onCancelExport={onCancelExport}
					onDownloadGeneratedMedia={onDownloadGeneratedMedia}
					onStartExport={onStartExport}
					reviewSupported={review.supported}
				/>
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer py-2 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-workbench-focus">
						Export details
					</summary>
					<div className="mt-3 space-y-4">
						<InspectorLine
							label="Audio mix"
							value={formatGeneratedAudioMix(outputAudio)}
						/>
						{review.supported ? (
							<InspectorLine label="Method" value={review.method.label} />
						) : null}
						<RuntimeChecksSection
							profileSupported={review.supported}
							runtime={runtime}
						/>
					</div>
				</details>
			</div>
		</section>
	);
}

function ExportReviewSection({
	audioQuality,
	hasAutomaticChannelMode,
	outputResolution,
	review,
	videoQuality,
}: {
	audioQuality: string;
	hasAutomaticChannelMode: boolean;
	outputResolution: ResolvedOutputResolution;
	review: ExportCapabilityReview;
	videoQuality: string;
}) {
	return (
		<section aria-label="Export review" className="min-w-0 overflow-visible">
			<div className="mb-4 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="text-lg font-medium tracking-tight text-foreground">
						Output
					</h3>
				</div>
				<Badge
					className="shrink-0"
					variant={review.supported ? "secondary" : "destructive"}
				>
					{review.supported ? "Ready" : "Blocked"}
				</Badge>
			</div>
			<p className="mb-5 text-sm leading-6 text-foreground">
				<span className="mb-1 block text-xs text-muted-foreground">Format</span>
				{review.plannedOutput?.label ?? "Invalid Output settings"}
			</p>
			<div className="space-y-3">
				<InspectorLine
					label="Resolution"
					value={formatOutputResolution(outputResolution)}
				/>
				<InspectorLine label="Video quality" value={videoQuality} />
				<InspectorLine label="Audio quality" value={audioQuality} />
				{review.supported ? (
					<InspectorLine label="Range" value={review.precision.label} />
				) : null}
			</div>

			{hasAutomaticChannelMode ? (
				<p className="mt-3 text-xs leading-5 text-muted-foreground">
					Auto-fix quiet side may place stereo differently than preview.
				</p>
			) : null}

			{review.supported ? null : (
				<p className="mt-2 rounded bg-destructive/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
					{review.technicalDetails}
				</p>
			)}
		</section>
	);
}

function RuntimeChecksSection({
	profileSupported,
	runtime,
}: {
	profileSupported: boolean;
	runtime: RuntimeSupport;
}) {
	const browserApisReady =
		runtime.capabilities.videoDecoder &&
		runtime.capabilities.videoEncoder &&
		runtime.capabilities.mediaSource &&
		runtime.capabilities.objectUrl &&
		runtime.capabilities.fileApi;

	return (
		<section aria-label="Export requirements" className="min-w-0">
			<div className="mb-3 text-xs font-medium text-foreground">
				Requirements
			</div>
			<ul className="flex flex-col gap-3 text-xs text-muted-foreground">
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0">Documented output profile</span>
					<CompactStatusBadge tone={profileSupported ? "ready" : "blocked"}>
						{profileSupported ? "Supported" : "Blocked"}
					</CompactStatusBadge>
				</li>
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0">Browser APIs</span>
					<CompactStatusBadge tone={browserApisReady ? "ready" : "blocked"}>
						{browserApisReady ? "Ready" : "Missing"}
					</CompactStatusBadge>
				</li>
			</ul>
		</section>
	);
}

function ExportJobSection({
	exportState,
	onCancelExport,
	onDownloadGeneratedMedia,
	onStartExport,
	reviewSupported,
}: {
	exportState: ExportSessionState;
	onCancelExport: () => void;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => boolean;
	onStartExport: () => void;
	reviewSupported: boolean;
}) {
	switch (exportState.status) {
		case "reviewing":
			return (
				<StartExportAction
					disabled={!reviewSupported}
					onStartExport={onStartExport}
				/>
			);
		case "running":
			return (
				<>
					<RunningExportStatus job={exportState.job} />
					{exportState.job.cancellation !== "unavailable" ? (
						<ExportActionShell>
							<Button
								className="h-10 w-full"
								disabled={exportState.job.cancellation === "requested"}
								onClick={onCancelExport}
								type="button"
								variant="outline"
							>
								<Square data-icon="inline-start" />
								Cancel export
							</Button>
						</ExportActionShell>
					) : null}
				</>
			);
		case "failed":
			return (
				<>
					<FailedExportStatus exportState={exportState} />
					<StartExportAction
						disabled={!reviewSupported}
						onStartExport={onStartExport}
						retry
					/>
				</>
			);
		case "cancelled":
			return (
				<>
					<output className="text-sm text-muted-foreground">
						Export cancelled.
					</output>
					<StartExportAction
						disabled={!reviewSupported}
						onStartExport={onStartExport}
						retry
					/>
				</>
			);
		case "succeeded":
			return (
				<GeneratedMediaStatus
					exportState={exportState}
					onDownloadGeneratedMedia={onDownloadGeneratedMedia}
				/>
			);
	}
}

function RunningExportStatus({ job }: { job: ExportJob }) {
	return (
		<div className="grid min-w-0 gap-3">
			<div className="flex min-w-0 items-center justify-between gap-3 text-sm">
				<output className="font-medium">
					{job.cancellation === "requested"
						? "Cancelling export…"
						: formatExportProgressPhase(job.progress.phase)}
				</output>
				<Badge className="max-w-32 truncate" variant="outline">
					{job.id}
				</Badge>
			</div>
			<Progress
				aria-label="Export progress"
				value={progressPercent(job.progress)}
			/>
			{job.cancellation === "unavailable" ? (
				<p className="text-xs text-muted-foreground">
					Cancellation unavailable
				</p>
			) : null}
		</div>
	);
}

function FailedExportStatus({
	exportState,
}: {
	exportState: Extract<ExportSessionState, { status: "failed" }>;
}) {
	return (
		<div className="grid min-w-0 gap-2 rounded border border-destructive/40 bg-workbench-lane p-3 text-sm">
			<span className="font-medium text-destructive">
				{exportState.message}
			</span>
			{exportState.technicalDetails ? (
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer font-medium text-foreground">
						Technical details
					</summary>
					<p className="mt-2 break-words">{exportState.technicalDetails}</p>
				</details>
			) : null}
		</div>
	);
}

function GeneratedMediaStatus({
	exportState,
	onDownloadGeneratedMedia,
}: {
	exportState: Extract<ExportSessionState, { status: "succeeded" }>;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => boolean;
}) {
	const [failedResult, setFailedResult] = useState<GeneratedMedia | null>(null);
	const { generatedMedia } = exportState;
	const outputSummary = formatGeneratedMediaOutput(
		exportState.generatedMedia.resolvedOutput,
	);

	return (
		<div
			aria-label="Generated media status"
			className="grid min-w-0 auto-rows-max gap-3 overflow-visible text-sm"
		>
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<BadgeCheck
					aria-hidden="true"
					className="size-4 text-workbench-progress"
				/>
				<span className="min-w-0 font-medium">Export complete</span>
				<Badge className="shrink-0" variant="outline">
					{exportState.delivered ? "Delivered" : "Ready to download"}
				</Badge>
			</div>
			<Button
				className="h-10 w-full"
				onClick={() =>
					setFailedResult(
						onDownloadGeneratedMedia(generatedMedia) ? null : generatedMedia,
					)
				}
				size="sm"
				type="button"
			>
				<Download data-icon="inline-start" />
				Download export
			</Button>
			{failedResult === generatedMedia ? (
				<p className="text-xs text-destructive" role="alert">
					Could not start the download. Try again.
				</p>
			) : null}
			<p
				aria-label="Generated media filename"
				className="block max-w-full min-w-0 rounded-md bg-muted/45 px-2 py-1.5 text-xs leading-5 [overflow-wrap:anywhere] whitespace-normal text-muted-foreground tabular-nums"
			>
				{exportState.generatedMedia.fileName}
			</p>
			{outputSummary ? (
				<p
					aria-label="Generated media output"
					className="text-xs text-muted-foreground"
				>
					{outputSummary}
				</p>
			) : null}
		</div>
	);
}

function StartExportAction({
	disabled,
	onStartExport,
	retry = false,
}: {
	disabled: boolean;
	onStartExport: () => void;
	retry?: boolean;
}) {
	return (
		<ExportActionShell>
			<Button
				className="h-11 w-full"
				disabled={disabled}
				onClick={onStartExport}
				type="button"
			>
				{retry ? "Retry export" : "Start export"}
			</Button>
		</ExportActionShell>
	);
}

function ExportActionShell({ children }: { children: ReactNode }) {
	return (
		<section aria-label="Export action" className="min-w-0">
			{children}
		</section>
	);
}

function InspectorLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-4 text-xs leading-5">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 text-left font-medium break-words text-foreground">
				{value}
			</span>
		</div>
	);
}

function CompactStatusBadge({
	children,
	tone,
}: {
	children: ReactNode;
	tone: "blocked" | "ready";
}) {
	return (
		<span
			className={`inline-flex shrink-0 items-center gap-1.5 font-medium ${
				tone === "ready"
					? "text-workbench-selected"
					: "bg-destructive/15 text-destructive"
			}`}
		>
			{tone === "ready" ? (
				<Check aria-hidden="true" className="size-3" />
			) : null}
			{children}
		</span>
	);
}

function formatGeneratedAudioMix(profile: ResolvedOutputAudioProfile): string {
	if (profile.kind === "invalid") {
		return "Invalid Output settings";
	}

	if (!profile.audioCodec || profile.includedTrackCount === 0) {
		return "No audio track";
	}

	const sourceTrackLabel =
		profile.includedTrackCount === 1 ? "track" : "tracks";
	return `${profile.includedTrackCount} ${sourceTrackLabel} → 1 ${profile.audioCodec.toUpperCase()} mix`;
}

function formatOutputResolution(resolution: ResolvedOutputResolution): string {
	if (resolution.kind === "invalid") {
		return "Invalid Output settings";
	}

	return resolution.dimensions
		? `${resolution.dimensions.width}x${resolution.dimensions.height}`
		: "Preserve source";
}

function formatGeneratedMediaOutput(output: ResolvedOutputPlan): string {
	const resolution = output.resolution
		? ` · ${output.resolution.width}x${output.resolution.height}`
		: "";
	return `${output.container.label} · ${formatOutputVideoCodec(output.videoCodec)}${output.audioCodec ? ` · ${output.audioCodec.toUpperCase()}` : " · No audio"}${resolution}`;
}

function progressPercent(progress: ExportProgress): number {
	return Math.round(Math.max(0.05, progress.completedRatio ?? 0.05) * 100);
}

function formatExportProgressPhase(phase: ExportProgress["phase"]): string {
	switch (phase) {
		case "encoding":
			// Conversion progress does not distinguish packet copying from transcoding.
			return "Processing";
		case "finalizing":
			return "Finalizing";
		case "muxing":
			return "Muxing";
		case "preparing":
			return "Preparing";
	}
}
