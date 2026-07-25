import { BadgeCheck, Download, Gauge, PlayCircle, Square } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	type ExportCapabilityReview,
	planDefaultExportCapability,
} from "@/editor-core/export-capability";
import type {
	ExportProgress,
	GeneratedMedia,
	ResolvedOutputPlan,
} from "@/editor-core/model";
import {
	type ResolvedOutputAudioProfile,
	type ResolvedOutputResolution,
	formatOutputQualitySetting,
	resolveOutputAudioProfile,
	resolveOutputResolution,
} from "@/editor-core/output-settings";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportJob, ExportSessionState } from "@/editor-core/session";
import { getMediabunnyOutputSupport } from "../adapters/mediabunny-output-support";
import type { ExportInspectorPanelProps } from "../types/export-inspector.types";
import { OutputSettingsPanel } from "./output-settings-panel";

const OUTPUT_SUPPORT = getMediabunnyOutputSupport();

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
		audioMix,
		outputSettings,
		runtime,
		selection,
		support: OUTPUT_SUPPORT,
	});
	const outputAudio = resolveOutputAudioProfile({
		asset,
		audioMix,
		outputSettings,
		support: OUTPUT_SUPPORT,
	});
	const outputResolution = resolveOutputResolution({
		asset,
		setting: outputSettings.resolution,
	});

	return (
		<section
			aria-label="Export inspector"
			className="flex min-w-0 flex-col overflow-hidden rounded-md border border-workbench-border bg-workbench-inspector shadow-sm xl:min-h-full xl:rounded-none xl:border-0 xl:shadow-none"
		>
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
				<ExportReviewSection
					outputAudio={outputAudio}
					outputResolution={outputResolution}
					review={review}
					runtime={runtime}
					videoQuality={formatOutputQualitySetting(outputSettings.videoQuality)}
					audioQuality={formatOutputQualitySetting(outputSettings.audioQuality)}
				/>
				<RuntimeChecksSection
					profileSupported={review.supported}
					runtime={runtime}
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
			</div>
		</section>
	);
}

function ExportReviewSection({
	audioQuality,
	outputAudio,
	outputResolution,
	review,
	runtime,
	videoQuality,
}: {
	audioQuality: string;
	outputAudio: ResolvedOutputAudioProfile;
	outputResolution: ResolvedOutputResolution;
	review: ExportCapabilityReview;
	runtime: RuntimeSupport;
	videoQuality: string;
}) {
	return (
		<section
			aria-label="Export review"
			className="overflow-visible rounded border border-workbench-selected/35 bg-workbench-hover/45 p-2.5"
		>
			<div className="mb-2 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold text-foreground">Output</h3>
				</div>
				<Badge
					className="shrink-0"
					variant={review.supported ? "secondary" : "destructive"}
				>
					{review.supported ? "Ready" : "Blocked"}
				</Badge>
			</div>
			<div className="space-y-2">
				<InspectorLine label="Format" value={review.plannedOutput.label} />
				<InspectorLine
					label="Resolution"
					value={formatOutputResolution(outputResolution)}
				/>
				<InspectorLine label="Video quality" value={videoQuality} />
				<InspectorLine label="Audio quality" value={audioQuality} />
				<InspectorLine
					label="Generated audio mix"
					value={formatGeneratedAudioMix(outputAudio)}
				/>
				{review.supported ? (
					<>
						<InspectorLine label="Export" value={review.method.label} />
						<InspectorLine label="Range" value={review.precision.label} />
						<InspectorLine
							label="Runtime"
							value={formatRuntimeSummary(runtime)}
						/>
					</>
				) : null}
			</div>

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
		<section
			aria-label="Export requirements"
			className="rounded border border-workbench-border bg-workbench-lane p-2.5"
		>
			<div className="mb-2 flex items-center gap-2 text-sm font-semibold">
				<Gauge aria-hidden="true" className="size-4 text-workbench-progress" />
				Requirements
			</div>
			<ul className="flex flex-col gap-2 text-[11px] text-muted-foreground">
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 truncate">Documented output profile</span>
					<CompactStatusBadge tone={profileSupported ? "ready" : "blocked"}>
						{profileSupported ? "Supported" : "Blocked"}
					</CompactStatusBadge>
				</li>
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 truncate">Browser APIs</span>
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
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
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
					{exportState.job.cancelSupported ? (
						<ExportActionShell>
							<Button
								className="h-8 w-full"
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
					/>
				</>
			);
		case "cancelled":
			return (
				<>
					<div className="rounded border border-workbench-border bg-workbench-lane p-3 text-sm text-muted-foreground">
						Export cancelled.
					</div>
					<StartExportAction
						disabled={!reviewSupported}
						onStartExport={onStartExport}
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
		<div className="grid min-w-0 gap-2 rounded border border-workbench-border bg-workbench-lane p-3">
			<div className="flex min-w-0 items-center justify-between gap-3 text-sm">
				<span className="font-medium">
					{formatExportProgressPhase(job.progress.phase)}
				</span>
				<Badge className="max-w-32 truncate" variant="outline">
					{job.id}
				</Badge>
			</div>
			<Progress
				aria-label="Export progress"
				value={progressPercent(job.progress)}
			/>
			{job.cancelSupported ? null : (
				<p className="text-xs text-muted-foreground">
					Cancellation unavailable
				</p>
			)}
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
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
}) {
	const outputSummary = exportState.generatedMedia.resolvedOutput
		? formatGeneratedMediaOutput(exportState.generatedMedia.resolvedOutput)
		: undefined;

	return (
		<div
			aria-label="Generated media status"
			className="grid min-w-0 auto-rows-max gap-3 overflow-visible rounded border border-workbench-border bg-workbench-lane p-3 text-sm"
		>
			<div className="flex min-w-0 items-center gap-2">
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
				className="w-full"
				onClick={() => onDownloadGeneratedMedia(exportState.generatedMedia)}
				size="sm"
				type="button"
			>
				<Download data-icon="inline-start" />
				Download export
			</Button>
			<p
				aria-label="Generated media filename"
				className="block max-w-full min-w-0 whitespace-normal rounded-md bg-muted/45 px-2 py-1.5 font-mono text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
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
}: {
	disabled: boolean;
	onStartExport: () => void;
}) {
	return (
		<ExportActionShell>
			<Button
				className="h-8 w-full bg-workbench-progress text-workbench-selected-foreground hover:bg-workbench-progress/90"
				disabled={disabled}
				onClick={onStartExport}
				type="button"
			>
				<PlayCircle data-icon="inline-start" />
				Start export
			</Button>
		</ExportActionShell>
	);
}

function ExportActionShell({ children }: { children: ReactNode }) {
	return (
		<section
			aria-label="Export action"
			className="rounded border border-workbench-border bg-workbench-lane p-2.5"
		>
			{children}
		</section>
	);
}

function InspectorLine({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-start justify-between gap-3 text-[11px]">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 break-words text-right font-medium text-foreground">
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
			className={`rounded px-2 py-0.5 font-medium ${
				tone === "ready"
					? "bg-workbench-hover text-workbench-selected"
					: "bg-destructive/15 text-destructive"
			}`}
		>
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
		profile.includedTrackCount === 1 ? "source track" : "source tracks";
	return `${profile.includedTrackCount} included ${sourceTrackLabel} to one ${profile.audioCodec.toUpperCase()} audio track`;
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
	return `${output.container.label} · ${formatVideoCodec(output.videoCodec)}${output.audioCodec ? ` · ${output.audioCodec.toUpperCase()}` : " · No audio"}${resolution}`;
}

function formatVideoCodec(codec: string): string {
	if (codec === "avc") {
		return "H.264";
	}
	if (codec === "hevc") {
		return "H.265";
	}

	return codec.toUpperCase();
}

function progressPercent(progress: ExportProgress): number {
	return Math.round(Math.max(0.05, progress.completedRatio ?? 0.05) * 100);
}

function formatExportProgressPhase(phase: ExportProgress["phase"]): string {
	switch (phase) {
		case "encoding":
			return "Encoding";
		case "finalizing":
			return "Finalizing";
		case "muxing":
			return "Muxing";
		case "preparing":
			return "Preparing";
	}
}

function formatRuntimeSummary(runtime: RuntimeSupport): string {
	return runtime.supported ? "WebCodecs ready" : "Runtime blocked";
}
