import {
	AlertTriangle,
	AudioLines,
	BarChart3,
	BadgeCheck,
	Download,
	FileVideo,
	Film,
	Gauge,
	Info,
	Monitor,
	PackageCheck,
	PlayCircle,
	Scissors,
	ShieldCheck,
	Square,
	X,
} from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	type ReactElement,
	type ReactNode,
	cloneElement,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";

import { planDefaultExportCapability } from "@/editor-core/export-capability";
import {
	type LocalMediaAssetInspector,
	analyzeLocalMediaAssetDraft,
} from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
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
	createInitialEditorSession,
	editorSessionReducer,
	shouldProtectEditorBeforeUnload,
} from "@/editor-core/session";
import { inspectBrowserLocalMediaAssetDraft } from "./browser-local-asset-analyzer";
import {
	browserDefaultExportRunner,
	type DefaultExportRunner,
	isDefaultExportCancelledError,
} from "./default-export-runner";
import {
	deliverBrowserGeneratedMedia,
	type GeneratedMediaDeliveryRequest,
} from "./generated-media-delivery";
import {
	createExportInspectorViewModel,
	type ExportInspectorActionViewModel,
	type ExportInspectorCapabilityViewModel,
	type ExportInspectorRuntimeCheckViewModel,
	type ExportInspectorStatusViewModel,
} from "./export-inspector-presenter";
import {
	createMediaAssetContextViewModel,
	type MediaAssetContextFact,
} from "./media-asset-context-presenter";
import { NativePreviewPlayer } from "./native-preview-player";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

type EditorNextRouteProps = {
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

const mockUploadedMediaPreviewPosterSrc = "/editor-workbench-prototype-frame.jpg";

export function EditorNextRoute({
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
	const [session, dispatch] = useReducer(
		editorSessionReducer,
		runtime,
		createInitialEditorSession,
	);
	const activeExportAbortControllerRef = useRef<AbortController | null>(null);
	const [generatedMediaBlobs, setGeneratedMediaBlobs] = useState<
		Record<string, Blob>
	>({});
	const [previewSource, setPreviewSource] = useState<Blob | null>(null);
	const [localFileInputKey, setLocalFileInputKey] = useState(0);
	const protectBeforeUnload = shouldProtectEditorBeforeUnload(session);
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

	useEffect(() => {
		if (!protectBeforeUnload) {
			return;
		}

		function handleBeforeUnload(event: BeforeUnloadEvent) {
			event.preventDefault();
			event.returnValue = "";
		}

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [protectBeforeUnload]);

	async function importLocalFile(file: File) {
		if (!session.importEnabled) {
			return;
		}

		clearSessionLocalResources();

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

	function clearSessionLocalResources() {
		activeExportAbortControllerRef.current?.abort();
		activeExportAbortControllerRef.current = null;
		setGeneratedMediaBlobs({});
		setPreviewSource(null);
	}

	function handleLocalFileSelected(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];

		if (!file) {
			return;
		}

		event.currentTarget.blur();
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

	async function startDefaultExport() {
		if (session.status !== "ready" || !previewSource) {
			return;
		}

		const review = planDefaultExportCapability({
			asset: session.asset,
			runtime: session.runtime,
			selection: session.selection,
		});

		if (!review.supported || session.export.status === "running") {
			return;
		}

		const jobId = createExportJobId();
		const abortController = new AbortController();
		activeExportAbortControllerRef.current = abortController;

		dispatch({
			cancelSupported: defaultExportRunner.cancelSupported,
			jobId,
			type: "export.started",
		});

		try {
			const result = await defaultExportRunner.run({
				asset: session.asset,
				onProgress: (progress) => {
					dispatch({
						jobId,
						progress,
						type: "export.progressed",
					});
				},
				selection: session.selection,
				signal: abortController.signal,
				source: previewSource,
			});

			if (abortController.signal.aborted) {
				dispatch({
					jobId,
					type: "export.cancelled",
				});
				return;
			}

			const generatedMedia = createGeneratedMedia({
				asset: session.asset,
				blob: result.blob,
				fileName: result.fileName,
				generatedMediaId: createGeneratedMediaId(),
				mimeType: result.mimeType,
				now,
				selection: session.selection,
			});

			setGeneratedMediaBlobs((currentBlobs) => ({
				...currentBlobs,
				[generatedMedia.id]: result.blob,
			}));
			dispatch({
				generatedMedia,
				jobId,
				type: "export.succeeded",
			});
		} catch (error) {
			if (
				abortController.signal.aborted ||
				isDefaultExportCancelledError(error)
			) {
				dispatch({
					jobId,
					type: "export.cancelled",
				});
				return;
			}

			dispatch({
				jobId,
				message: "Default export failed.",
				technicalDetails: errorToMessage(error),
				type: "export.failed",
			});
		} finally {
			if (activeExportAbortControllerRef.current === abortController) {
				activeExportAbortControllerRef.current = null;
			}
		}
	}

	function cancelDefaultExport() {
		if (
			session.status !== "ready" ||
			session.export.status !== "running" ||
			!session.export.job.cancelSupported
		) {
			return;
		}

		activeExportAbortControllerRef.current?.abort();
	}

	function downloadGeneratedMedia(generatedMedia: GeneratedMedia) {
		const blob = generatedMediaBlobs[generatedMedia.id];

		if (!blob) {
			return;
		}

		deliverGeneratedMedia({
			blob,
			generatedMedia,
		});
		dispatch({
			generatedMediaId: generatedMedia.id,
			type: "generated-media.delivered",
		});
	}

	function requestCloseFile() {
		if (!canCloseEditorSession(session)) {
			return;
		}

		const confirmed = window.confirm(
			"Close this media asset? This clears the current selection, preview state, waveform state, and generated media result.",
		);

		if (!confirmed) {
			return;
		}

		clearSessionLocalResources();
		setLocalFileInputKey((currentKey) => currentKey + 1);
		dispatch({
			type: "session.closed",
		});
	}

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
					onDefaultExportCancelRequested={cancelDefaultExport}
					onDefaultExportStartRequested={() => {
						void startDefaultExport();
					}}
					onCloseFileRequested={requestCloseFile}
					onGeneratedMediaDownloadRequested={downloadGeneratedMedia}
					localFileInputKey={localFileInputKey}
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
					previewPosterSrc={displayedPreviewPosterSrc}
					previewSource={displayedPreviewSource}
					session={displayedSession}
				/>
			)}
		</EditorWorkbenchFrame>
	);
}

type EditorWorkbenchFrameProps = {
	activeAsset: ReadyMediaAsset | null;
	children: ReactNode;
	runtime: RuntimeSupport;
	status: EditorSessionState["status"];
};

function EditorWorkbenchFrame({
	activeAsset,
	children,
	runtime,
	status,
}: EditorWorkbenchFrameProps) {
	return (
		<main className="workbench dark h-screen min-h-screen overflow-hidden bg-workbench text-foreground">
			<div className="grid h-full min-h-0 grid-rows-[2.625rem_minmax(0,1fr)] overflow-hidden">
				<header
					aria-label="Editor workbench top bar"
					className="grid min-w-0 grid-cols-[minmax(12rem,auto)_minmax(0,1fr)_auto] items-center gap-3 border-b border-workbench-border-strong bg-workbench px-2.5"
				>
					<div className="flex min-w-0 items-center gap-2">
						<div className="flex size-7 shrink-0 items-center justify-center rounded border border-workbench-border-strong bg-workbench-viewer text-workbench-selected">
							<Scissors aria-hidden="true" className="size-4" />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-xs font-semibold uppercase tracking-normal">
								YAFFW
							</h1>
							<p className="truncate text-[10px] uppercase leading-none tracking-[0.18em] text-muted-foreground">
								Editor workbench
							</p>
						</div>
					</div>
					<TopBarMediaAssetSummary asset={activeAsset} />
					<div className="flex min-w-0 items-center justify-end gap-2">
						<div className="flex h-7 min-w-0 items-center gap-1.5 rounded border border-workbench-border bg-workbench-inspector px-2 text-xs">
							{runtime.supported ? (
								<ShieldCheck
									aria-hidden="true"
									className="size-3.5 shrink-0 text-workbench-progress"
								/>
							) : (
								<AlertTriangle
									aria-hidden="true"
									className="size-3.5 shrink-0 text-destructive"
								/>
							)}
							<span className="truncate font-medium">
								{runtime.supported ? "WebCodecs" : "Runtime blocked"}
							</span>
						</div>
					</div>
				</header>
				<div className="grid min-h-0 grid-cols-[4rem_minmax(0,1fr)]">
					<EditorWorkbenchRail status={status} />
					<div
						className={`min-h-0 min-w-0 overflow-auto overscroll-contain bg-workbench p-3 md:p-4 ${
							status === "ready" ? "xl:overflow-hidden xl:p-0" : ""
						}`}
					>
						{children}
					</div>
				</div>
			</div>
		</main>
	);
}

function TopBarMediaAssetSummary({ asset }: { asset: ReadyMediaAsset | null }) {
	if (!asset) {
		return (
			<div
				aria-label="Top bar media asset summary"
				className="hidden min-w-0 md:block"
			/>
		);
	}

	const primaryVideo = asset.tracks.video[0];
	const resolution =
		primaryVideo?.width && primaryVideo.height
			? `${primaryVideo.width} x ${primaryVideo.height}`
			: "Resolution unknown";

	return (
		<div
			aria-label="Top bar media asset summary"
			className="hidden min-w-0 items-center justify-center gap-3 font-mono text-[11px] text-muted-foreground lg:flex"
		>
			<span className="max-w-[28rem] truncate">{asset.label}</span>
			<span aria-hidden="true" className="text-workbench-border-strong">
				|
			</span>
			<span className="whitespace-nowrap">{resolution}</span>
			<span aria-hidden="true" className="text-workbench-border-strong">
				|
			</span>
			<span className="whitespace-nowrap">
				{formatTopBarFrameTiming(asset)}
			</span>
		</div>
	);
}

function EditorWorkbenchRail({
	status,
}: { status: EditorSessionState["status"] }) {
	return (
		<aside
			aria-label="Editor workbench rail"
			className="flex min-h-0 flex-col items-center gap-2 border-r border-workbench-border-strong bg-workbench-rail px-2 py-3"
		>
			<WorkbenchRailItem
				active={status !== "unsupported-runtime"}
				icon={<FileVideo />}
				label="Media asset"
			/>
			<WorkbenchRailItem
				active={status === "ready"}
				icon={<PlayCircle />}
				label="Preview"
			/>
			<WorkbenchRailItem
				active={status === "ready"}
				icon={<BarChart3 />}
				label="Selection"
			/>
			<WorkbenchRailItem
				active={status === "ready"}
				icon={<PackageCheck />}
				label="Export"
			/>
			<WorkbenchRailItem
				active={status === "unsupported-runtime"}
				icon={<Monitor />}
				label="Runtime"
			/>
		</aside>
	);
}

function WorkbenchRailItem({
	active,
	icon,
	label,
}: {
	active: boolean;
	icon: AnalyticsIconElement;
	label: string;
}) {
	return (
		<div
			aria-label={label}
			className={`flex size-9 items-center justify-center rounded-md border text-muted-foreground ${
				active
					? "border-workbench-border-strong bg-workbench-hover text-foreground"
					: "border-transparent bg-transparent"
			}`}
			title={label}
		>
			{cloneElement(icon, {
				"aria-hidden": true,
				className: "size-4",
			})}
		</div>
	);
}

type UnsupportedRuntimeStateProps = {
	session: Extract<EditorSessionState, { status: "unsupported-runtime" }>;
};

function UnsupportedRuntimeState({ session }: UnsupportedRuntimeStateProps) {
	const missing = session.runtime.supported ? [] : session.runtime.missing;

	return (
		<section
			aria-label="Editor workbench session"
			className="grid min-h-[calc(100vh-5rem)]"
		>
			<section
				aria-label="Workbench center region"
				className="grid min-h-[28rem] place-items-center rounded-md border border-workbench-border bg-workbench-viewer p-6"
			>
				<div className="grid w-full max-w-3xl gap-4">
					<Alert variant="destructive" className="max-w-3xl">
						<AlertTriangle aria-hidden="true" />
						<AlertTitle>Unsupported runtime</AlertTitle>
						<AlertDescription>
							<p>{session.message}</p>
							<p>
								Editor-next requires a supported runtime before a local media
								asset can be imported.
							</p>
							{missing.length > 0 ? (
								<p>Missing capability keys: {missing.join(", ")}</p>
							) : null}
						</AlertDescription>
					</Alert>
					<RuntimeChecksPanel session={session} />
				</div>
			</section>
		</section>
	);
}

type EditorSessionShellProps = {
	localFileInputKey: number;
	onCloseFileRequested: () => void;
	onDefaultExportCancelRequested: () => void;
	onDefaultExportStartRequested: () => void;
	onGeneratedMediaDownloadRequested: (generatedMedia: GeneratedMedia) => void;
	onLocalFileDropped: (event: DragEvent<HTMLElement>) => void;
	onLocalFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
	onSelectionEndRequested: (playheadUs: number) => void;
	onSelectionRangeMoveRequested: (deltaUs: number) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartRequested: (playheadUs: number) => void;
	previewPosterSrc?: string;
	previewSource: Blob | null;
	session: Exclude<EditorSessionState, { status: "unsupported-runtime" }>;
};

function EditorSessionShell({
	localFileInputKey,
	onCloseFileRequested,
	onDefaultExportCancelRequested,
	onDefaultExportStartRequested,
	onGeneratedMediaDownloadRequested,
	onLocalFileDropped,
	onLocalFileSelected,
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	previewPosterSrc,
	previewSource,
	session,
}: EditorSessionShellProps) {
	if (session.status !== "ready") {
		return (
			<section
				aria-label="Editor workbench session"
				className="grid min-h-[calc(100vh-5rem)]"
			>
				<section
					aria-label="Workbench center region"
					className="min-h-[28rem] overflow-hidden rounded-md border border-workbench-border bg-workbench-viewer p-3"
				>
					<div aria-label="Workbench preview region" className="min-h-full">
						<NonReadyImportSurface
							localFileInputKey={localFileInputKey}
							onLocalFileDropped={onLocalFileDropped}
							onLocalFileSelected={onLocalFileSelected}
							session={session}
						/>
					</div>
				</section>
			</section>
		);
	}

	const selectionEditingDisabled = session.export.status === "running";
	const closeFileDisabled = !canCloseEditorSession(session);

	return (
		<section
			aria-label="Editor workbench session"
			className="grid min-h-[calc(100vh-5rem)] grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[16.25rem_minmax(30rem,1fr)_19.75rem] xl:grid-rows-[minmax(0,1fr)_2.75rem_38%] xl:gap-0 xl:overflow-hidden"
		>
			<section
				aria-label="Workbench media asset region"
				className="flex min-w-0 flex-col overflow-x-hidden overscroll-contain xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-r xl:border-workbench-border-strong xl:bg-workbench-inspector"
			>
				<ActiveMediaAssetContext
					closeFileDisabled={closeFileDisabled}
					onCloseFileRequested={onCloseFileRequested}
					session={session}
				/>
			</section>

			{previewSource ? (
				<NativePreviewPlayer
					asset={session.asset}
					onSelectionEndRequested={onSelectionEndRequested}
					onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
					onSelectionResetRequested={onSelectionResetRequested}
					onSelectionStartRequested={onSelectionStartRequested}
					previewPosterSrc={previewPosterSrc}
					selection={session.selection}
					selectionEditingDisabled={selectionEditingDisabled}
					shortcutsDisabled={selectionEditingDisabled}
					source={previewSource}
				/>
			) : null}

			<aside
				aria-label="Workbench inspector region"
				className="flex min-w-0 flex-col overflow-x-hidden overscroll-contain xl:col-start-3 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-workbench-border-strong xl:bg-workbench-inspector"
			>
				<ExportInspectorPanel
					asset={session.asset}
					exportState={session.export}
					onCancelExport={onDefaultExportCancelRequested}
					onDownloadGeneratedMedia={onGeneratedMediaDownloadRequested}
					onStartExport={onDefaultExportStartRequested}
					runtime={session.runtime}
					selection={session.selection}
				/>
			</aside>
		</section>
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

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
			{children}
		</div>
	);
}

function CompactMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="truncate leading-tight text-muted-foreground/75">
				{label}
			</div>
			<div className="truncate font-mono leading-tight text-foreground">
				{value}
			</div>
		</div>
	);
}

function CompactTrackRow({
	icon,
	label,
	meta,
	status,
}: {
	icon: AnalyticsIconElement;
	label: string;
	meta: string;
	status: string;
}) {
	return (
		<div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded border border-workbench-border bg-workbench-lane px-2 py-1.5">
			<div className="text-muted-foreground">
				{cloneElement(icon, {
					"aria-hidden": true,
					className: "size-4",
				})}
			</div>
			<div className="min-w-0">
				<div className="truncate text-xs font-medium leading-tight text-foreground">
					{label}
				</div>
				<div className="truncate text-[10px] leading-tight text-muted-foreground">
					{meta}
				</div>
			</div>
			<Badge
				className="border-workbench-border bg-workbench-hover text-[10px] text-workbench-progress"
				variant="outline"
			>
				{status}
			</Badge>
		</div>
	);
}

function CompactTimeBox({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded border border-workbench-border bg-workbench-lane p-1.5">
			<div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</div>
			<div className="truncate font-mono text-xs text-foreground">{value}</div>
		</div>
	);
}

function ActiveMediaAssetContext({
	closeFileDisabled,
	onCloseFileRequested,
	session,
}: {
	closeFileDisabled: boolean;
	onCloseFileRequested: () => void;
	session: Extract<EditorSessionState, { status: "ready" }>;
}) {
	const viewModel = createMediaAssetContextViewModel({
		asset: session.asset,
		closeDisabled: closeFileDisabled,
		selection: session.selection,
	});

	return (
		<section
			aria-label="Media asset context"
			className="flex min-w-0 max-w-full flex-col overflow-hidden overflow-x-hidden rounded-md border border-workbench-border bg-workbench-inspector xl:min-h-full xl:rounded-none xl:border-0"
		>
			<WorkbenchPanelHeader
				icon={<FileVideo />}
				title="Media asset"
				trailing={
					<Button
						aria-label={viewModel.closeFile.label}
						className="size-7 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
						disabled={viewModel.closeFile.disabled}
						onClick={onCloseFileRequested}
						size="icon"
						title={viewModel.closeFile.label}
						type="button"
						variant="outline"
					>
						<X data-icon="inline-start" />
					</Button>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
				<SectionLabel>Source</SectionLabel>
				<div
					aria-label="Loaded media asset"
					className="mb-3 space-y-1 rounded border border-workbench-border bg-workbench-lane p-2"
				>
					<div className="truncate text-sm font-medium text-foreground">
						{viewModel.identity.name}
					</div>
					<div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
						<CompactMetric
							label="Size"
							value={factValue(viewModel.provenanceFacts, "Size")}
						/>
						<CompactMetric
							label="Duration"
							value={formatMediaTime(session.asset.durationUs)}
						/>
						<CompactMetric
							label="Codec"
							value={formatAssetCodecSummary(session.asset)}
						/>
						<CompactMetric
							label="Frames"
							value={formatTopBarFrameTiming(session.asset)}
						/>
					</div>
				</div>

				<SectionLabel>Tracks</SectionLabel>
				<div className="mb-3 space-y-1.5">
					{session.asset.tracks.video.map((track, trackIndex) => (
						<CompactTrackRow
							icon={<Film />}
							key={track.id}
							label={track.label ?? `Video ${trackIndex + 1}`}
							meta={formatVideoTrackMeta(track)}
							status="Previewable"
						/>
					))}
					{session.asset.tracks.audio.map((track, trackIndex) => (
						<CompactTrackRow
							icon={<AudioLines />}
							key={track.id}
							label={track.label ?? `Audio ${trackIndex + 1}`}
							meta={formatAudioTrackMeta(track)}
							status="ready"
						/>
					))}
					{session.asset.tracks.audio.length === 0 ? (
						<CompactTrackRow
							icon={<AudioLines />}
							label="Audio"
							meta="No audio tracks"
							status="none"
						/>
					) : null}
				</div>

				<SectionLabel>Selection</SectionLabel>
				<div className="grid grid-cols-2 gap-2 text-[11px]">
					<CompactTimeBox
						label="Start"
						value={formatMediaTime(session.selection.startUs)}
					/>
					<CompactTimeBox
						label="End"
						value={formatMediaTime(session.selection.endUs)}
					/>
					<CompactTimeBox
						label="Duration"
						value={formatMediaTime(
							session.selection.endUs - session.selection.startUs,
						)}
					/>
					<CompactTimeBox
						label="Coverage"
						value={formatSelectionCoverage(session.selection, session.asset)}
					/>
				</div>

				<div className="mt-auto pt-2">
					<div className="flex min-w-0 items-center gap-2 rounded border border-workbench-border bg-workbench-lane p-1.5 text-[10px] leading-none text-muted-foreground">
						<Info
							aria-hidden="true"
							className="size-3.5 shrink-0 text-workbench-selected"
						/>
						<span className="shrink-0 font-medium text-foreground">
							Workbench intent
						</span>
						<span className="min-w-0 truncate">
							One asset, one playhead, one exported selection.
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}

function NonReadyImportSurface({
	localFileInputKey,
	onLocalFileDropped,
	onLocalFileSelected,
	session,
}: {
	localFileInputKey: number;
	onLocalFileDropped: (event: DragEvent<HTMLElement>) => void;
	onLocalFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
	session: Exclude<EditorSessionShellProps["session"], { status: "ready" }>;
}) {
	const copy = workbenchNonReadyStateCopy(session);

	return (
		<div
			className="grid min-h-full place-items-center rounded-md border border-dashed border-workbench-border-strong bg-background/55 p-6"
			data-testid="editor-next-drop-zone"
			onDragOver={(event) => event.preventDefault()}
			onDrop={onLocalFileDropped}
		>
			<div className="flex w-full max-w-xl flex-col gap-5">
				<div className="grid gap-2">
					<h3 className="text-xl font-semibold tracking-tight">{copy.title}</h3>
					<p className="text-sm leading-6 text-muted-foreground">
						{copy.description}
					</p>
				</div>
				<div className="grid gap-2">
					<label
						className="text-sm font-medium"
						htmlFor="editor-next-local-file"
					>
						Local video file
					</label>
					<Input
						accept="video/*"
						disabled={!session.importEnabled}
						id="editor-next-local-file"
						key={localFileInputKey}
						onChange={onLocalFileSelected}
						type="file"
					/>
				</div>
				<SessionStatusLine session={session} />
			</div>
		</div>
	);
}

function workbenchNonReadyStateCopy(
	session: Exclude<EditorSessionShellProps["session"], { status: "ready" }>,
) {
	switch (session.status) {
		case "closed":
			return {
				description:
					"The previous session was closed. Reopen the route to start another editing session.",
				title: "Session closed",
			};
		case "empty":
			return {
				description:
					"Choose or drop one local video file to create a media asset draft.",
				title: "No media asset loaded",
			};
		case "failure":
			return {
				description:
					"Choose another local video file after reviewing the analysis details below.",
				title: "Media asset analysis failed",
			};
		case "loading":
			return {
				description:
					"Analysis is running; import controls stay disabled until the asset is ready.",
				title: "Analyzing media asset draft",
			};
	}
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
				title="Export inspector"
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
								Export review
							</h3>
							<div className="text-[11px] text-muted-foreground">
								Start-time snapshot
							</div>
						</div>
						<Badge
							className="border-workbench-selected/40 bg-workbench-selected/10 text-workbench-selected"
							variant="outline"
						>
							{viewModel.badge.label}
						</Badge>
					</div>
					<div className="space-y-2">
						<InspectorLine
							label="Output"
							value={viewModel.review.plannedOutput.value}
						/>
						{viewModel.review.supported ? (
							<>
								<InspectorLine
									label="Strategy"
									value={viewModel.review.method.value}
								/>
								<InspectorLine
									label="Precision"
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
					selectedRange={
						viewModel.review.supported
							? viewModel.review.precision.value
							: "Blocked"
					}
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
	selectedRange,
}: {
	capability: ExportInspectorCapabilityViewModel;
	checks: ExportInspectorRuntimeCheckViewModel[];
	selectedRange: string;
}) {
	const runtimeReady = checks.every((check) => check.available);

	return (
		<section
			aria-label="Runtime checks"
			className="rounded border border-workbench-border bg-workbench-lane p-2.5"
		>
			<div className="mb-2 flex items-center gap-2 text-sm font-semibold">
				<Gauge aria-hidden="true" className="size-4 text-workbench-progress" />
				Capability
			</div>
			<ul className="flex flex-col gap-2 text-[11px] text-muted-foreground">
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 truncate">Default profile</span>
					<CompactStatusBadge tone={capability.tone}>
						{capability.value === "Ready" ? "Supported" : "Blocked"}
					</CompactStatusBadge>
				</li>
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 truncate">Selected range</span>
					<CompactStatusBadge tone={capability.tone}>
						{selectedRange}
					</CompactStatusBadge>
				</li>
				<li className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 truncate">Runtime checks</span>
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
			<div className="grid min-w-0 gap-1 rounded border border-destructive/40 bg-workbench-lane p-3 text-sm">
				<span className="font-medium text-destructive">{status.message}</span>
				{status.technicalDetails ? (
					<p className="break-words text-xs text-muted-foreground">
						{status.technicalDetails}
					</p>
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
					Download generated media
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
				Generated media
			</div>
			<div className="mb-2 text-[11px] leading-4 text-muted-foreground">
				No generated media yet. Export and delivery stay separate.
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

function RuntimeChecksPanel({
	session,
}: {
	session: EditorSessionState;
}) {
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

type AnalyticsIconElement = ReactElement<{
	"aria-hidden"?: boolean;
	className?: string;
}>;

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

function createMockUploadedMediaFixture(
	runtime: RuntimeSupport,
): {
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

function factValue(facts: MediaAssetContextFact[], label: string): string {
	return facts.find((fact) => fact.label === label)?.value ?? "Unknown";
}

function formatAssetCodecSummary(asset: ReadyMediaAsset): string {
	const videoCodec = asset.tracks.video[0]?.codec?.trim() || "Video";
	const audioCodec = asset.tracks.audio[0]?.codec?.trim() || "Audio";

	return `${videoCodec.toUpperCase()} / ${audioCodec.toUpperCase()}`;
}

function formatVideoTrackMeta(
	track: ReadyMediaAsset["tracks"]["video"][number],
): string {
	if (track.width && track.height) {
		return `${track.width} x ${track.height}`;
	}

	return "Resolution unknown";
}

function formatAudioTrackMeta(
	track: ReadyMediaAsset["tracks"]["audio"][number],
): string {
	return track.language?.trim() || "und";
}

function formatSelectionCoverage(
	selection: Selection,
	asset: ReadyMediaAsset,
): string {
	const durationUs = Math.max(0, selection.endUs - selection.startUs);
	const coveragePercent =
		asset.durationUs > 0 ? (durationUs / asset.durationUs) * 100 : 0;

	return `${formatNumber(coveragePercent)}%`;
}

function formatRuntimeSummary(runtime: RuntimeSupport): string {
	return runtime.supported ? "Chromium WebCodecs ready" : "Runtime blocked";
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

function formatNumber(value: number): string {
	if (Number.isInteger(value)) {
		return `${value}`;
	}

	return value.toFixed(2).replace(/\.?0+$/, "");
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

function formatTopBarFrameTiming(asset: ReadyMediaAsset): string {
	const fps = Number.isInteger(asset.frameTiming.fps)
		? String(asset.frameTiming.fps)
		: asset.frameTiming.fps.toFixed(2);

	return `${fps} fps ${asset.frameTiming.source}`;
}

function createGeneratedMedia({
	asset,
	blob,
	fileName,
	generatedMediaId,
	mimeType,
	now,
	selection,
}: {
	asset: ReadyMediaAsset;
	blob: Blob;
	fileName?: string;
	generatedMediaId: string;
	mimeType?: string;
	now: () => number;
	selection: Selection;
}): GeneratedMedia {
	return {
		assetId: asset.id,
		createdAtMs: now(),
		fileName:
			fileName ?? createGeneratedMediaFileName(asset.provenance.fileName),
		id: generatedMediaId,
		mimeType: mimeType ?? (blob.type || "video/mp4"),
		profile: asset.exportCapability.profile,
		selection: { ...selection },
		sizeBytes: blob.size,
	};
}

function createGeneratedMediaFileName(fileName: string): string {
	const extensionStart = fileName.lastIndexOf(".");

	if (extensionStart <= 0) {
		return `${fileName}-export.mp4`;
	}

	return `${fileName.slice(0, extensionStart)}-export.mp4`;
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
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
