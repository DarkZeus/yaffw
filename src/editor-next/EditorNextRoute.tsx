import {
	BadgeCheck,
	Download,
	Gauge,
	PackageCheck,
	PlayCircle,
	Square,
} from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	type ReactElement,
	type ReactNode,
	cloneElement,
	useMemo,
} from "react";

import type { LocalMediaAssetInspector } from "@/editor-core/local-file-analysis";
import type {
	GeneratedMedia,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import {
	type RuntimeSupport,
	detectRuntimeSupport,
} from "@/editor-core/runtime-capabilities";
import {
	type EditorSessionState,
	type ExportSessionState,
	canCloseEditorSession,
} from "@/editor-core/session";
import { inspectBrowserLocalMediaAssetDraft } from "./browser-local-asset-analyzer";
import {
	type DefaultExportRunner,
	browserDefaultExportRunner,
} from "./default-export-runner";
import {
	EditorSessionShell,
	EditorWorkbenchFrame,
	UnsupportedRuntimeState,
} from "./editor-workbench";
import {
	type ExportInspectorActionViewModel,
	type ExportInspectorCapabilityViewModel,
	type ExportInspectorRuntimeCheckViewModel,
	type ExportInspectorStatusViewModel,
	createExportInspectorViewModel,
} from "./export-inspector-presenter";
import {
	type GeneratedMediaDeliveryRequest,
	deliverBrowserGeneratedMedia,
} from "./generated-media-delivery";
import { MediaAssetContextPanel } from "./media-asset-context";
import { NativePreviewPlayer } from "./native-preview-player";
import { useSingleAssetEditingSession } from "./use-single-asset-editing-session";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type EditorNextRouteProps = {
	confirmCloseFile?: (message: string) => boolean;
	createAssetId?: () => string;
	createDraftId?: () => string;
	createExportJobId?: () => string;
	createGeneratedMediaId?: () => string;
	defaultExportRunner?: DefaultExportRunner;
	deliverGeneratedMedia?: (request: GeneratedMediaDeliveryRequest) => void;
	initialRuntime?: RuntimeSupport;
	inspectLocalAsset?: LocalMediaAssetInspector;
	mockUploadedMediaState?: boolean;
	now?: () => number;
};

const mockUploadedMediaPreviewPosterSrc =
	"/editor-workbench-prototype-frame.jpg";

export function EditorNextRoute({
	confirmCloseFile,
	createAssetId = () => createBrowserId("asset"),
	createDraftId = () => createBrowserId("draft"),
	createExportJobId = () => createBrowserId("export"),
	createGeneratedMediaId = () => createBrowserId("generated"),
	defaultExportRunner = browserDefaultExportRunner,
	deliverGeneratedMedia = deliverBrowserGeneratedMedia,
	initialRuntime,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
	mockUploadedMediaState,
	now = () => Date.now(),
}: EditorNextRouteProps) {
	const runtime = useMemo(
		() => initialRuntime ?? detectRuntimeSupport(),
		[initialRuntime],
	);
	const { commands, localFileInputKey, previewSource, session } =
		useSingleAssetEditingSession({
			confirmCloseFile,
			createAssetId,
			createDraftId,
			createExportJobId,
			createGeneratedMediaId,
			defaultExportRunner,
			deliverGeneratedMedia,
			inspectLocalAsset,
			now,
			runtime,
		});
	const visualFixture = useMemo(
		() => createMockUploadedMediaFixture(runtime),
		[runtime],
	);
	const visualFixtureActive =
		session.status === "empty" &&
		runtime.supported &&
		(mockUploadedMediaState ?? shouldUseMockUploadedMediaStateFromUrl());
	const displayedSession = visualFixtureActive
		? visualFixture.session
		: session;
	const displayedPreviewSource = visualFixtureActive
		? visualFixture.source
		: previewSource;
	const displayedPreviewPosterSrc = visualFixtureActive
		? mockUploadedMediaPreviewPosterSrc
		: undefined;

	function handleLocalFileSelected(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];

		if (!file) {
			return;
		}

		event.currentTarget.blur();
		void commands.importLocalFile(file);
	}

	function handleLocalFileDropped(event: DragEvent<HTMLElement>) {
		event.preventDefault();

		const file = event.dataTransfer.files[0];

		if (!file) {
			return;
		}

		void commands.importLocalFile(file);
	}

	const readyMediaAssetContext =
		displayedSession.status === "ready" ? (
			<MediaAssetContextPanel
				asset={displayedSession.asset}
				closeFileDisabled={!canCloseEditorSession(displayedSession)}
				onCloseFileRequested={commands.requestCloseFile}
				selection={displayedSession.selection}
			/>
		) : null;
	const selectionEditingDisabled =
		displayedSession.status === "ready" &&
		displayedSession.export.status === "running";
	const readyPreviewPlayer =
		displayedSession.status === "ready" && displayedPreviewSource ? (
			<NativePreviewPlayer
				asset={displayedSession.asset}
				onSelectionEndRequested={commands.setSelectionEndFromPlayhead}
				onSelectionRangeMoveRequested={commands.moveSelectionRange}
				onSelectionResetRequested={commands.resetSelection}
				onSelectionStartRequested={commands.setSelectionStartFromPlayhead}
				previewPosterSrc={displayedPreviewPosterSrc}
				selection={displayedSession.selection}
				selectionEditingDisabled={selectionEditingDisabled}
				shortcutsDisabled={selectionEditingDisabled}
				source={displayedPreviewSource}
			/>
		) : null;
	const readyExportInspector =
		displayedSession.status === "ready" ? (
			<ExportInspectorPanel
				asset={displayedSession.asset}
				exportState={displayedSession.export}
				onCancelExport={commands.cancelDefaultExport}
				onDownloadGeneratedMedia={commands.downloadGeneratedMedia}
				onStartExport={() => {
					void commands.startDefaultExport();
				}}
				runtime={displayedSession.runtime}
				selection={displayedSession.selection}
			/>
		) : null;

	return (
		<EditorWorkbenchFrame
			activeAsset={
				displayedSession.status === "ready" ? displayedSession.asset : null
			}
			runtime={runtime}
			status={displayedSession.status}
		>
			{displayedSession.status === "unsupported-runtime" ? (
				<UnsupportedRuntimeState session={displayedSession} />
			) : (
				<EditorSessionShell
					exportInspector={readyExportInspector}
					localFileInputKey={localFileInputKey}
					mediaAssetContext={readyMediaAssetContext}
					onLocalFileDropped={handleLocalFileDropped}
					onLocalFileSelected={handleLocalFileSelected}
					previewPlayer={readyPreviewPlayer}
					session={displayedSession}
				/>
			)}
		</EditorWorkbenchFrame>
	);
}

function WorkbenchPanelHeader({
	icon,
	trailing,
	title,
}: {
	icon: AnalyticsIconElement;
	trailing?: ReactNode;
	title: string;
}) {
	return (
		<div className="flex h-[42px] shrink-0 items-center justify-between border-b border-workbench-border px-3">
			<div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
				{cloneElement(icon, {
					"aria-hidden": true,
					className: "size-4 text-workbench-selected",
				})}
				<span className="truncate">{title}</span>
			</div>
			{trailing ? <div className="shrink-0">{trailing}</div> : null}
		</div>
	);
}

function ExportInspectorPanel({
	asset,
	exportState,
	onCancelExport,
	onDownloadGeneratedMedia,
	onStartExport,
	runtime,
	selection,
}: {
	asset: ReadyMediaAsset;
	exportState: ExportSessionState;
	onCancelExport: () => void;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	onStartExport: () => void;
	runtime: RuntimeSupport;
	selection: Selection;
}) {
	const viewModel = createExportInspectorViewModel({
		asset,
		exportState,
		runtime,
		selection,
	});
	const deliveryAction =
		viewModel.action.kind === "download" ? viewModel.action : undefined;

	return (
		<section
			aria-label="Export inspector"
			className="flex min-w-0 flex-col overflow-hidden rounded-md border border-workbench-border bg-workbench-inspector shadow-sm xl:min-h-full xl:rounded-none xl:border-0 xl:shadow-none"
		>
			<WorkbenchPanelHeader
				icon={<PackageCheck />}
				title="Export"
				trailing={
					<Badge
						className="shrink-0"
						variant={
							viewModel.badge.tone === "ready" ? "secondary" : "destructive"
						}
					>
						{viewModel.badge.label}
					</Badge>
				}
			/>

			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
				<section
					aria-label="Export review"
					className="overflow-visible rounded border border-workbench-selected/35 bg-workbench-hover/45 p-2.5"
				>
					<div className="mb-2 flex items-start justify-between gap-3">
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								Export settings
							</h3>
							<div className="text-[11px] text-muted-foreground">
								Current settings
							</div>
						</div>
					</div>
					<div className="space-y-2">
						<InspectorLine
							label={viewModel.review.plannedOutput.label}
							value={viewModel.review.plannedOutput.value}
						/>
						{viewModel.review.supported ? (
							<>
								<InspectorLine
									label={viewModel.review.method.label}
									value={viewModel.review.method.value}
								/>
								<InspectorLine
									label={viewModel.review.precision.label}
									value={viewModel.review.precision.value}
								/>
								<InspectorLine
									label="Runtime"
									value={formatRuntimeSummary(runtime)}
								/>
							</>
						) : null}
					</div>

					{viewModel.review.supported ? null : (
						<p className="mt-2 rounded bg-destructive/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
							{viewModel.review.technicalDetails}
						</p>
					)}
				</section>
				<RuntimeChecksSection
					capability={viewModel.capability}
					checks={viewModel.runtimeChecks}
				/>
				<ExportJobStatus
					deliveryAction={deliveryAction}
					onDownloadGeneratedMedia={onDownloadGeneratedMedia}
					status={viewModel.status}
				/>
				{deliveryAction ? null : (
					<ExportReviewActions
						action={viewModel.action}
						onCancelExport={onCancelExport}
						onDownloadGeneratedMedia={onDownloadGeneratedMedia}
						onStartExport={onStartExport}
					/>
				)}
			</div>
		</section>
	);
}

function RuntimeChecksSection({
	capability,
	checks,
}: {
	capability: ExportInspectorCapabilityViewModel;
	checks: ExportInspectorRuntimeCheckViewModel[];
}) {
	const runtimeReady = checks.every((check) => check.available);

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
					<span className="min-w-0 truncate">MP4 export</span>
					<CompactStatusBadge tone={capability.tone}>
						{capability.value === "Ready" ? "Supported" : "Blocked"}
					</CompactStatusBadge>
				</li>
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 truncate">Browser APIs</span>
					<CompactStatusBadge tone={runtimeReady ? "ready" : "blocked"}>
						{runtimeReady ? "Ready" : "Missing"}
					</CompactStatusBadge>
				</li>
			</ul>
		</section>
	);
}

function ExportJobStatus({
	deliveryAction,
	onDownloadGeneratedMedia,
	status,
}: {
	deliveryAction?: Extract<
		ExportInspectorActionViewModel,
		{ kind: "download" }
	>;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	status: ExportInspectorStatusViewModel;
}) {
	if (status.kind === "running") {
		return (
			<div className="grid min-w-0 gap-2 rounded border border-workbench-border bg-workbench-lane p-3">
				<div className="flex min-w-0 items-center justify-between gap-3 text-sm">
					<span className="font-medium">{status.title}</span>
					<Badge className="max-w-32 truncate" variant="outline">
						{status.jobId}
					</Badge>
				</div>
				<Progress aria-label="Export progress" value={status.progressPercent} />
				{status.cancelUnavailableMessage ? (
					<p className="text-xs text-muted-foreground">
						{status.cancelUnavailableMessage}
					</p>
				) : null}
			</div>
		);
	}

	if (status.kind === "succeeded") {
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
					<span className="min-w-0 font-medium">{status.title}</span>
					<Badge className="shrink-0" variant="outline">
						{status.deliveryState}
					</Badge>
				</div>
				{deliveryAction ? (
					<Button
						className="w-full"
						onClick={() =>
							onDownloadGeneratedMedia(deliveryAction.generatedMedia)
						}
						size="sm"
						type="button"
					>
						<Download data-icon="inline-start" />
						{deliveryAction.label}
					</Button>
				) : null}
				<p
					aria-label="Generated media filename"
					className="block max-w-full min-w-0 whitespace-normal rounded-md bg-muted/45 px-2 py-1.5 font-mono text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
				>
					{status.fileName}
				</p>
			</div>
		);
	}

	if (status.kind === "failed") {
		return (
			<div className="grid min-w-0 gap-2 rounded border border-destructive/40 bg-workbench-lane p-3 text-sm">
				<span className="font-medium text-destructive">{status.message}</span>
				{status.technicalDetails ? (
					<details className="text-xs text-muted-foreground">
						<summary className="cursor-pointer font-medium text-foreground">
							Technical details
						</summary>
						<p className="mt-2 break-words">{status.technicalDetails}</p>
					</details>
				) : null}
			</div>
		);
	}

	if (status.kind === "cancelled") {
		return (
			<div className="rounded border border-workbench-border bg-workbench-lane p-3 text-sm text-muted-foreground">
				{status.message}
			</div>
		);
	}

	return null;
}

function ExportReviewActions({
	action,
	onCancelExport,
	onDownloadGeneratedMedia,
	onStartExport,
}: {
	action: ExportInspectorActionViewModel;
	onCancelExport: () => void;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	onStartExport: () => void;
}) {
	if (action.kind === "cancel") {
		return (
			<GeneratedMediaActionShell>
				<Button
					className="h-8 w-full"
					onClick={onCancelExport}
					type="button"
					variant="outline"
				>
					<Square data-icon="inline-start" />
					Cancel export
				</Button>
			</GeneratedMediaActionShell>
		);
	}

	if (action.kind === "download") {
		return (
			<GeneratedMediaActionShell>
				<Button
					className="h-8 w-full"
					onClick={() => onDownloadGeneratedMedia(action.generatedMedia)}
					type="button"
				>
					<Download data-icon="inline-start" />
					{action.label}
				</Button>
			</GeneratedMediaActionShell>
		);
	}

	if (action.kind === "none") {
		return null;
	}

	return (
		<GeneratedMediaActionShell>
			<Button
				className="h-8 w-full bg-workbench-progress text-workbench-selected-foreground hover:bg-workbench-progress/90"
				disabled={action.disabled}
				onClick={onStartExport}
				type="button"
			>
				<PlayCircle data-icon="inline-start" />
				{action.label}
			</Button>
		</GeneratedMediaActionShell>
	);
}

function GeneratedMediaActionShell({ children }: { children: ReactNode }) {
	return (
		<section className="rounded border border-workbench-border bg-workbench-lane p-2.5">
			<div className="mb-2 flex items-center gap-2 text-sm font-semibold">
				<BadgeCheck
					aria-hidden="true"
					className="size-4 text-workbench-progress"
				/>
				Export file
			</div>
			<div className="mb-2 text-[11px] leading-4 text-muted-foreground">
				No export yet.
			</div>
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

type AnalyticsIconElement = ReactElement<{
	"aria-hidden"?: boolean;
	className?: string;
}>;

function createMockUploadedMediaFixture(runtime: RuntimeSupport): {
	session: Extract<EditorSessionState, { status: "ready" }>;
	source: Blob;
} {
	const asset: ReadyMediaAsset = {
		durationUs: 13_500_000,
		exportCapability: {
			profile: {
				audioCodec: "aac",
				container: "mp4",
				videoCodec: "h264",
			},
			supported: true,
		},
		frameTiming: {
			fps: 60,
			frameDurationUs: 16_667,
			source: "known",
		},
		id: "asset-editor-next-visual-fixture",
		label: "stalker-patch-1.5-teaser.mp4",
		provenance: {
			fileName: "stalker-patch-1.5-teaser.mp4",
			mimeType: "video/mp4",
			sizeBytes: 30_000_000,
		},
		tracks: {
			audio: [
				{
					channels: 2,
					codec: "aac",
					id: "audio-fixture-voice",
					kind: "audio",
					label: "Voice",
					language: "en",
					sampleRate: 48_000,
				},
				{
					channels: 2,
					codec: "aac",
					id: "audio-fixture-desktop",
					kind: "audio",
					label: "Desktop",
					language: "und",
					sampleRate: 48_000,
				},
			],
			video: [
				{
					codec: "h264",
					height: 2160,
					id: "video-fixture-main",
					kind: "video",
					label: "Video 1",
					width: 3840,
				},
			],
		},
	};

	return {
		session: {
			asset,
			export: {
				status: "reviewing",
			},
			importEnabled: false,
			runtime,
			selection: {
				endUs: 9_860_000,
				startUs: 2_440_000,
			},
			status: "ready",
		},
		source: new Blob(["editor-next visual fixture"], {
			type: "video/mp4",
		}),
	};
}

function shouldUseMockUploadedMediaStateFromUrl(): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	return (
		new URLSearchParams(window.location.search).get("mockUploadedMedia") === "1"
	);
}

function formatRuntimeSummary(runtime: RuntimeSupport): string {
	return runtime.supported ? "WebCodecs ready" : "Runtime blocked";
}

function createBrowserId(prefix: string): string {
	if (
		"crypto" in globalThis &&
		typeof globalThis.crypto.randomUUID === "function"
	) {
		return `${prefix}-${globalThis.crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}`;
}
