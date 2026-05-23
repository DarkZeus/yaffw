import {
	AlertTriangle,
	BarChart3,
	CheckCircle2,
	Clock,
	FileVideo,
	HardDrive,
	Monitor,
	PackageCheck,
	Ratio,
	Volume2,
	VolumeX,
} from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	type ReactElement,
	type ReactNode,
	cloneElement,
	useMemo,
	useReducer,
	useState,
} from "react";

import { planDefaultExportCapability } from "@/editor-core/export-capability";
import {
	type LocalMediaAssetInspector,
	analyzeLocalMediaAssetDraft,
} from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import type { ReadyMediaAsset, Selection } from "@/editor-core/model";
import {
	type RuntimeSupport,
	detectRuntimeSupport,
} from "@/editor-core/runtime-capabilities";
import {
	type EditorSessionState,
	createInitialEditorSession,
	editorSessionReducer,
} from "@/editor-core/session";
import { inspectBrowserLocalMediaAssetDraft } from "./browser-local-asset-analyzer";
import { NativePreviewPlayer } from "./native-preview-player";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type EditorNextRouteProps = {
	createAssetId?: () => string;
	createDraftId?: () => string;
	initialRuntime?: RuntimeSupport;
	inspectLocalAsset?: LocalMediaAssetInspector;
};

export function EditorNextRoute({
	createAssetId = () => createBrowserId("asset"),
	createDraftId = () => createBrowserId("draft"),
	initialRuntime,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
}: EditorNextRouteProps) {
	const runtime = useMemo(
		() => initialRuntime ?? detectRuntimeSupport(),
		[initialRuntime],
	);
	const [session, dispatch] = useReducer(
		editorSessionReducer,
		runtime,
		createInitialEditorSession,
	);
	const [previewSource, setPreviewSource] = useState<Blob | null>(null);

	async function importLocalFile(file: File) {
		if (!session.importEnabled) {
			return;
		}

		setPreviewSource(null);

		const draft = createLocalMediaAssetDraft(file, {
			createDraftId,
		});

		dispatch({
			draft,
			type: "import.started",
		});

		const result = await analyzeLocalMediaAssetDraft(draft, {
			createAssetId,
			inspect: inspectLocalAsset,
			runtime,
		});

		if (result.status === "ready") {
			setPreviewSource(file);
			dispatch({
				asset: result.asset,
				selection: result.selection,
				type: "asset.ready",
			});
			return;
		}

		setPreviewSource(null);
		dispatch({
			message: result.failure.message,
			technicalDetails: result.failure.technicalDetails,
			type: "session.failed",
		});
	}

	function handleLocalFileSelected(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];

		if (!file) {
			return;
		}

		void importLocalFile(file);
	}

	function handleLocalFileDropped(event: DragEvent<HTMLElement>) {
		event.preventDefault();

		const file = event.dataTransfer.files[0];

		if (!file) {
			return;
		}

		void importLocalFile(file);
	}

	return (
		<main className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
				<header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
					<div className="flex flex-col gap-2">
						<Badge variant="outline" className="w-fit">
							First slice
						</Badge>
						<div className="flex flex-col gap-1">
							<h1 className="text-3xl font-semibold tracking-tight">
								Editor-next
							</h1>
							<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
								A separate local-first editor surface for one active media
								asset.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
						{runtime.supported ? (
							<CheckCircle2 aria-hidden="true" className="text-chart-2" />
						) : (
							<AlertTriangle aria-hidden="true" className="text-destructive" />
						)}
						<span className="font-medium">
							{runtime.supported ? "Runtime ready" : "Runtime blocked"}
						</span>
					</div>
				</header>

				{session.status === "unsupported-runtime" ? (
					<UnsupportedRuntimeState session={session} />
				) : (
					<EditorSessionShell
						onLocalFileDropped={handleLocalFileDropped}
						onLocalFileSelected={handleLocalFileSelected}
						onSelectionEndRequested={(playheadUs) =>
							dispatch({
								playheadUs,
								type: "selection.end.setFromPlayhead",
							})
						}
						onSelectionRangeMoveRequested={(deltaUs) =>
							dispatch({
								deltaUs,
								type: "selection.range.moved",
							})
						}
						onSelectionResetRequested={() =>
							dispatch({
								type: "selection.reset",
							})
						}
						onSelectionStartRequested={(playheadUs) =>
							dispatch({
								playheadUs,
								type: "selection.start.setFromPlayhead",
							})
						}
						previewSource={previewSource}
						session={session}
					/>
				)}
			</div>
		</main>
	);
}

type UnsupportedRuntimeStateProps = {
	session: Extract<EditorSessionState, { status: "unsupported-runtime" }>;
};

function UnsupportedRuntimeState({ session }: UnsupportedRuntimeStateProps) {
	const missing = session.runtime.supported ? [] : session.runtime.missing;

	return (
		<section className="grid min-h-[26rem] content-center">
			<Alert variant="destructive" className="max-w-3xl">
				<AlertTriangle aria-hidden="true" />
				<AlertTitle>Unsupported runtime</AlertTitle>
				<AlertDescription>
					<p>{session.message}</p>
					{missing.length > 0 ? (
						<p>Missing capability keys: {missing.join(", ")}</p>
					) : null}
				</AlertDescription>
			</Alert>
		</section>
	);
}

type EditorSessionShellProps = {
	onLocalFileDropped: (event: DragEvent<HTMLElement>) => void;
	onLocalFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
	onSelectionEndRequested: (playheadUs: number) => void;
	onSelectionRangeMoveRequested: (deltaUs: number) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartRequested: (playheadUs: number) => void;
	previewSource: Blob | null;
	session: Exclude<EditorSessionState, { status: "unsupported-runtime" }>;
};

function EditorSessionShell({
	onLocalFileDropped,
	onLocalFileSelected,
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	previewSource,
	session,
}: EditorSessionShellProps) {
	return (
		<section
			aria-labelledby="editor-next-import-title"
			className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
		>
			<div className="flex min-h-[28rem] flex-col gap-6 rounded-md border bg-card p-5">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="flex items-start gap-3">
						<div className="flex size-11 items-center justify-center rounded-md border bg-muted">
							<FileVideo aria-hidden="true" />
						</div>
						<div className="flex flex-col gap-1">
							<h2
								id="editor-next-import-title"
								className="text-xl font-semibold tracking-tight"
							>
								Local media asset
							</h2>
							<p className="max-w-xl text-sm leading-6 text-muted-foreground">
								Ready to accept one local media asset for the first-slice
								workflow.
							</p>
						</div>
					</div>
					<Badge variant="secondary">
						{formatSessionStatus(session.status)}
					</Badge>
				</div>

				<div className="grid flex-1 place-items-center rounded-md border border-dashed bg-background/60 p-6">
					<div
						className="flex w-full max-w-lg flex-col gap-4"
						data-testid="editor-next-drop-zone"
						onDragOver={(event) => event.preventDefault()}
						onDrop={onLocalFileDropped}
					>
						<label
							className="text-sm font-medium"
							htmlFor="editor-next-local-file"
						>
							Local video file
						</label>
						<div className="flex flex-col gap-3">
							<Input
								accept="video/*"
								disabled={!session.importEnabled}
								id="editor-next-local-file"
								onChange={onLocalFileSelected}
								type="file"
							/>
						</div>
						<SessionStatusLine session={session} />
					</div>
				</div>

				{session.status === "ready" && previewSource ? (
					<NativePreviewPlayer
						asset={session.asset}
						onSelectionEndRequested={onSelectionEndRequested}
						onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
						onSelectionResetRequested={onSelectionResetRequested}
						onSelectionStartRequested={onSelectionStartRequested}
						selection={session.selection}
						source={previewSource}
					/>
				) : null}
			</div>

			<aside className="flex flex-col gap-4">
				{session.status === "ready" ? (
					<>
						<ExportReviewPanel
							asset={session.asset}
							runtime={session.runtime}
							selection={session.selection}
						/>
						<MediaAnalyticsPanel
							asset={session.asset}
							selection={session.selection}
						/>
					</>
				) : null}
				<RuntimeChecksPanel session={session} />
			</aside>
		</section>
	);
}

function ExportReviewPanel({
	asset,
	runtime,
	selection,
}: {
	asset: ReadyMediaAsset;
	runtime: RuntimeSupport;
	selection: Selection;
}) {
	const review = planDefaultExportCapability({
		asset,
		runtime,
		selection,
	});

	return (
		<section
			aria-label="Export review"
			className="flex flex-col gap-4 rounded-md border bg-card p-4"
		>
			<div className="flex items-center justify-between gap-3">
				<h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
					<PackageCheck aria-hidden="true" className="size-4" />
					Export review
				</h2>
				<Badge variant={review.supported ? "secondary" : "destructive"}>
					{review.supported ? "Ready" : "Blocked"}
				</Badge>
			</div>

			<div className="grid gap-2">
				<ExportReviewRow
					label="Planned output"
					value={review.plannedOutput.label}
				/>
				{review.supported ? (
					<>
						<ExportReviewRow label="Method" value={review.method.label} />
						<ExportReviewRow
							label="Expected precision"
							value={review.precision.label}
						/>
					</>
				) : null}
			</div>

			<p className="text-sm leading-6 text-muted-foreground">{review.reason}</p>
			{review.supported ? null : (
				<p className="text-xs leading-5 text-muted-foreground">
					{review.technicalDetails}
				</p>
			)}
		</section>
	);
}

function ExportReviewRow({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<Badge
				className="max-w-52 truncate font-mono"
				title={value}
				variant="outline"
			>
				{value}
			</Badge>
		</div>
	);
}

function RuntimeChecksPanel({
	session,
}: Pick<EditorSessionShellProps, "session">) {
	return (
		<section className="flex flex-col gap-3 rounded-md border bg-card p-4">
			<h2 className="text-sm font-semibold tracking-tight">Runtime checks</h2>
			<ul className="flex flex-col gap-3 text-sm text-muted-foreground">
				{runtimeCheckRows(session.runtime).map((row) => (
					<li
						className="flex items-center justify-between gap-3"
						key={row.label}
					>
						<span>{row.label}</span>
						<Badge variant={row.available ? "secondary" : "destructive"}>
							{row.available ? "Ready" : "Missing"}
						</Badge>
					</li>
				))}
			</ul>
		</section>
	);
}

function MediaAnalyticsPanel({
	asset,
	selection,
}: {
	asset: ReadyMediaAsset;
	selection: Selection;
}) {
	const primaryVideoTrack = asset.tracks.video[0];
	const primaryAudioTrack = asset.tracks.audio[0];
	const estimatedBitrate = estimateBitrateBitsPerSecond(asset);
	const selectionDurationUs = selection.endUs - selection.startUs;
	const coverage = asset.durationUs
		? Math.round((selectionDurationUs / asset.durationUs) * 100)
		: 0;

	return (
		<section
			aria-label="Media analytics"
			className="flex flex-col gap-4 rounded-md border bg-card p-4"
		>
			<div className="flex items-center justify-between gap-3">
				<h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
					<BarChart3 aria-hidden="true" className="size-4" />
					Media analytics
				</h2>
				<Badge variant="secondary">{asset.tracks.video.length} video</Badge>
			</div>

			<AnalyticsSection icon={<FileVideo />} title="File info">
				<AnalyticsRow label="Name" value={asset.provenance.fileName} />
				<AnalyticsRow
					label="Size"
					value={formatFileSize(asset.provenance.sizeBytes)}
				/>
				<AnalyticsRow
					label="Type"
					value={formatContainerType(asset.provenance)}
				/>
				<AnalyticsRow
					icon={<Clock />}
					label="Duration"
					value={formatMediaTime(asset.durationUs)}
				/>
			</AnalyticsSection>

			<AnalyticsSection icon={<Monitor />} title="Video track">
				<AnalyticsRow
					label="Resolution"
					value={
						primaryVideoTrack?.width && primaryVideoTrack.height
							? `${primaryVideoTrack.width}x${primaryVideoTrack.height}`
							: "Unknown"
					}
				/>
				<AnalyticsRow
					label="Class"
					value={resolutionCategory(
						primaryVideoTrack?.width,
						primaryVideoTrack?.height,
					)}
				/>
				<AnalyticsRow
					icon={<Ratio />}
					label="Aspect"
					value={formatAspectRatio(
						primaryVideoTrack?.width,
						primaryVideoTrack?.height,
					)}
				/>
				<AnalyticsRow
					label="Frame rate"
					value={
						asset.frameTiming.source === "known"
							? `${formatNumber(asset.frameTiming.fps)} fps`
							: `${formatNumber(asset.frameTiming.fps)} fps est.`
					}
				/>
				<AnalyticsRow
					label="Codec"
					value={primaryVideoTrack?.codec ?? "Unknown"}
				/>
				<AnalyticsRow
					icon={<HardDrive />}
					label="Bitrate"
					value={formatBitrate(estimatedBitrate)}
				/>
				<AnalyticsQualityBadge bitrate={estimatedBitrate} />
			</AnalyticsSection>

			<AnalyticsSection
				icon={primaryAudioTrack ? <Volume2 /> : <VolumeX />}
				title="Audio track"
			>
				<AnalyticsRow
					label="Status"
					value={primaryAudioTrack ? "Present" : "None"}
				/>
				{primaryAudioTrack ? (
					<>
						<AnalyticsRow
							label="Channels"
							value={formatChannels(primaryAudioTrack.channels)}
						/>
						<AnalyticsRow
							label="Sample rate"
							value={formatSampleRate(primaryAudioTrack.sampleRate)}
						/>
						<AnalyticsRow
							label="Codec"
							value={primaryAudioTrack.codec ?? "Unknown"}
						/>
						<AnalyticsRow
							label="Language"
							value={primaryAudioTrack.language ?? "und"}
						/>
					</>
				) : null}
			</AnalyticsSection>

			<AnalyticsSection icon={<Clock />} title="Selection">
				<AnalyticsRow
					label="Start"
					value={formatMediaTime(selection.startUs)}
				/>
				<AnalyticsRow label="End" value={formatMediaTime(selection.endUs)} />
				<AnalyticsRow
					label="Duration"
					value={formatMediaTime(selectionDurationUs)}
				/>
				<AnalyticsRow label="Coverage" value={`${coverage}%`} />
			</AnalyticsSection>
		</section>
	);
}

function AnalyticsSection({
	children,
	icon,
	title,
}: {
	children: ReactNode;
	icon: AnalyticsIconElement;
	title: string;
}) {
	return (
		<section className="grid gap-3 border-t pt-3">
			<h3 className="flex items-center gap-2 text-sm font-semibold">
				{cloneElement(icon, {
					"aria-hidden": true,
					className: "size-4",
				})}
				{title}
			</h3>
			<div className="grid gap-2">{children}</div>
		</section>
	);
}

function AnalyticsRow({
	icon,
	label,
	value,
}: {
	icon?: AnalyticsIconElement;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="flex items-center gap-1.5 text-muted-foreground">
				{icon
					? cloneElement(icon, {
							"aria-hidden": true,
							className: "size-3",
						})
					: null}
				{label}
			</span>
			<Badge
				className="max-w-40 truncate font-mono"
				title={value}
				variant="outline"
			>
				{value}
			</Badge>
		</div>
	);
}

type AnalyticsIconElement = ReactElement<{
	"aria-hidden"?: boolean;
	className?: string;
}>;

function AnalyticsQualityBadge({ bitrate }: { bitrate: number | null }) {
	const quality = videoBitrateQuality(bitrate);

	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="text-muted-foreground">Quality</span>
			<Badge variant={quality.variant}>{quality.label}</Badge>
		</div>
	);
}

function runtimeCheckRows(runtime: EditorSessionState["runtime"]) {
	return [
		{
			available: runtime.capabilities.videoDecoder,
			label: "Video decoder",
		},
		{
			available: runtime.capabilities.videoEncoder,
			label: "Video encoder",
		},
		{
			available: runtime.capabilities.mediaSource,
			label: "Media source",
		},
		{
			available: runtime.capabilities.objectUrl && runtime.capabilities.fileApi,
			label: "Local file APIs",
		},
	];
}

function SessionStatusLine({
	session,
}: Pick<EditorSessionShellProps, "session">) {
	if (session.status === "ready") {
		return (
			<div className="grid gap-3 rounded-md border bg-background p-4">
				<h3 className="text-sm font-semibold">Ready media asset</h3>
				<dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
					<div>
						<dt className="font-medium text-foreground">Asset</dt>
						<dd>{session.asset.label}</dd>
					</div>
					<div>
						<dt className="font-medium text-foreground">Selection</dt>
						<dd>
							{formatMediaTime(session.selection.startUs)} -{" "}
							{formatMediaTime(session.selection.endUs)}
						</dd>
					</div>
					<div>
						<dt className="font-medium text-foreground">Duration</dt>
						<dd>Duration: {formatMediaTime(session.asset.durationUs)}</dd>
					</div>
					<div>
						<dt className="font-medium text-foreground">Tracks</dt>
						<dd>Video tracks: {session.asset.tracks.video.length}</dd>
						<dd>Audio tracks: {session.asset.tracks.audio.length}</dd>
					</div>
				</dl>
			</div>
		);
	}

	if (session.status === "loading") {
		return (
			<p className="text-sm text-muted-foreground">
				Preparing media asset draft {session.draft.label}.
			</p>
		);
	}

	if (session.status === "failure") {
		return (
			<Alert>
				<AlertTriangle aria-hidden="true" />
				<AlertTitle>{session.message}</AlertTitle>
				{session.technicalDetails ? (
					<AlertDescription>
						<details className="mt-2">
							<summary className="cursor-pointer font-medium">
								Technical details
							</summary>
							<p className="mt-2">{session.technicalDetails}</p>
						</details>
					</AlertDescription>
				) : null}
			</Alert>
		);
	}

	if (session.status === "closed") {
		return (
			<p className="text-sm text-muted-foreground">
				Session closed; reopen the route to start again.
			</p>
		);
	}

	return (
		<p className="text-sm text-muted-foreground">
			Waiting for a media asset draft.
		</p>
	);
}

function formatSessionStatus(
	status: EditorSessionShellProps["session"]["status"],
) {
	switch (status) {
		case "closed":
			return "Closed";
		case "empty":
			return "Empty";
		case "failure":
			return "Failure";
		case "loading":
			return "Loading";
		case "ready":
			return "Ready";
	}
}

function estimateBitrateBitsPerSecond(asset: ReadyMediaAsset): number | null {
	const durationSeconds = asset.durationUs / 1_000_000;

	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		return null;
	}

	return Math.round((asset.provenance.sizeBytes * 8) / durationSeconds);
}

function formatFileSize(bytes: number): string {
	if (bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const unitIndex = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** unitIndex;

	return `${formatNumber(value)} ${units[unitIndex]}`;
}

function formatBitrate(bitsPerSecond: number | null): string {
	if (!bitsPerSecond || bitsPerSecond <= 0) {
		return "Unknown";
	}

	if (bitsPerSecond >= 1_000_000) {
		return `${formatNumber(bitsPerSecond / 1_000_000)} Mbps`;
	}

	if (bitsPerSecond >= 1_000) {
		return `${formatNumber(bitsPerSecond / 1_000)} Kbps`;
	}

	return `${bitsPerSecond} bps`;
}

function formatContainerType(
	provenance: ReadyMediaAsset["provenance"],
): string {
	const mimeSubtype = provenance.mimeType?.split("/")[1];

	if (mimeSubtype) {
		return mimeSubtype.toUpperCase();
	}

	const extension = provenance.fileName.split(".").pop();

	return extension ? extension.toUpperCase() : "Unknown";
}

function resolutionCategory(width?: number, height?: number): string {
	if (!width || !height) {
		return "Unknown";
	}

	if (width >= 3840 && height >= 2160) {
		return "4K UHD";
	}

	if (width >= 2560 && height >= 1440) {
		return "2K QHD";
	}

	if (width >= 1920 && height >= 1080) {
		return "Full HD";
	}

	if (width >= 1280 && height >= 720) {
		return "HD";
	}

	if (width >= 854 && height >= 480) {
		return "SD";
	}

	return "Low resolution";
}

function formatAspectRatio(width?: number, height?: number): string {
	if (!width || !height) {
		return "Unknown";
	}

	const divisor = greatestCommonDivisor(width, height);

	return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function formatChannels(channels?: number): string {
	if (!channels) {
		return "Unknown";
	}

	if (channels === 1) {
		return "Mono";
	}

	if (channels === 2) {
		return "Stereo";
	}

	if (channels === 6) {
		return "5.1";
	}

	if (channels === 8) {
		return "7.1";
	}

	return `${channels}ch`;
}

function formatSampleRate(sampleRate?: number): string {
	if (!sampleRate) {
		return "Unknown";
	}

	return `${formatNumber(sampleRate / 1_000)} kHz`;
}

function videoBitrateQuality(bitrate: number | null): {
	label: string;
	variant: "default" | "destructive" | "outline" | "secondary";
} {
	if (!bitrate) {
		return { label: "Unknown", variant: "secondary" };
	}

	if (bitrate >= 10_000_000) {
		return { label: "Excellent", variant: "default" };
	}

	if (bitrate >= 5_000_000) {
		return { label: "High", variant: "default" };
	}

	if (bitrate >= 2_000_000) {
		return { label: "Medium", variant: "outline" };
	}

	if (bitrate >= 1_000_000) {
		return { label: "Low", variant: "outline" };
	}

	return { label: "Very low", variant: "destructive" };
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: value >= 10 ? 1 : 2,
		minimumFractionDigits: 0,
	}).format(value);
}

function greatestCommonDivisor(left: number, right: number): number {
	let a = Math.abs(left);
	let b = Math.abs(right);

	while (b !== 0) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}

	return a || 1;
}

function formatMediaTime(timeUs: number): string {
	const totalMilliseconds = Math.floor(timeUs / 1_000);
	const milliseconds = totalMilliseconds % 1_000;
	const totalSeconds = Math.floor(totalMilliseconds / 1_000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
		2,
		"0",
	)}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(
		3,
		"0",
	)}`;
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
