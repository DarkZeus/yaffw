import {
	AlertTriangle,
	BarChart3,
	CheckCircle2,
	Clock,
	Download,
	FileVideo,
	HardDrive,
	Monitor,
	PackageCheck,
	PlayCircle,
	Ratio,
	Square,
	Volume2,
	VolumeX,
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
	ExportProgress,
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
	now?: () => number;
};

export function EditorNextRoute({
	createAssetId = () => createBrowserId("asset"),
	createDraftId = () => createBrowserId("draft"),
	createExportJobId = () => createBrowserId("export"),
	createGeneratedMediaId = () => createBrowserId("generated"),
	defaultExportRunner = browserDefaultExportRunner,
	deliverGeneratedMedia = deliverBrowserGeneratedMedia,
	initialRuntime,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
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
		<EditorWorkbenchFrame runtime={runtime} status={session.status}>
			{session.status === "unsupported-runtime" ? (
				<UnsupportedRuntimeState session={session} />
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
					previewSource={previewSource}
					session={session}
				/>
			)}
		</EditorWorkbenchFrame>
	);
}

type EditorWorkbenchFrameProps = {
	children: ReactNode;
	runtime: RuntimeSupport;
	status: EditorSessionState["status"];
};

function EditorWorkbenchFrame({
	children,
	runtime,
	status,
}: EditorWorkbenchFrameProps) {
	return (
		<main className="workbench dark min-h-screen bg-workbench text-foreground">
			<div className="grid min-h-screen grid-rows-[3rem_minmax(0,1fr)] overflow-hidden">
				<header
					aria-label="Editor workbench top bar"
					className="flex min-w-0 items-center justify-between gap-3 border-b border-workbench-border-strong bg-workbench px-3"
				>
					<div className="flex min-w-0 items-center gap-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-workbench-border-strong bg-workbench-viewer">
							<FileVideo aria-hidden="true" className="size-4" />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-sm font-semibold tracking-tight">
								Editor-next
							</h1>
							<p className="truncate text-xs text-muted-foreground">
								Single-asset editor workbench
							</p>
						</div>
					</div>
					<div className="flex min-w-0 items-center gap-2">
						<Badge className="hidden sm:inline-flex" variant="outline">
							First slice
						</Badge>
						<div className="flex min-w-0 items-center gap-2 rounded-md border border-workbench-border bg-workbench-inspector px-2.5 py-1.5 text-xs">
							{runtime.supported ? (
								<CheckCircle2
									aria-hidden="true"
									className="size-4 shrink-0 text-chart-2"
								/>
							) : (
								<AlertTriangle
									aria-hidden="true"
									className="size-4 shrink-0 text-destructive"
								/>
							)}
							<span className="truncate font-medium">
								{runtime.supported ? "Runtime ready" : "Runtime blocked"}
							</span>
						</div>
					</div>
				</header>
				<div className="grid min-h-0 grid-cols-[3.25rem_minmax(0,1fr)]">
					<EditorWorkbenchRail status={status} />
					<div className="min-w-0 overflow-auto bg-workbench p-3 md:p-4">
						{children}
					</div>
				</div>
			</div>
		</main>
	);
}

function EditorWorkbenchRail({
	status,
}: { status: EditorSessionState["status"] }) {
	return (
		<nav
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
		</nav>
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
			className="grid min-h-[calc(100vh-5rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"
		>
			<div className="grid min-h-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
				<section
					aria-label="Workbench media asset region"
					className="flex min-h-[18rem] flex-col gap-4 rounded-md border border-workbench-border bg-workbench-inspector p-4"
				>
					<WorkbenchRegionHeader
						icon={<FileVideo />}
						kicker="Media asset"
						title="Import unavailable"
					/>
					<p className="text-sm leading-6 text-muted-foreground">
						Editor-next requires a supported runtime before a local media asset
						can be imported.
					</p>
					<Badge className="w-fit" variant="destructive">
						Runtime blocked
					</Badge>
				</section>
				<section
					aria-label="Workbench preview region"
					className="grid min-h-[28rem] place-items-center rounded-md border border-workbench-border bg-workbench-viewer p-6"
				>
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
			</div>
			<aside
				aria-label="Workbench inspector region"
				className="flex min-w-0 flex-col gap-4"
			>
				<RuntimeChecksPanel session={session} />
			</aside>
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
	previewSource,
	session,
}: EditorSessionShellProps) {
	const selectionEditingDisabled =
		session.status === "ready" && session.export.status === "running";
	const closeFileVisible = session.status === "ready";
	const closeFileDisabled = !canCloseEditorSession(session);

	return (
		<section
			aria-label="Editor workbench session"
			className="grid min-h-[calc(100vh-5rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"
		>
			<div className="grid min-h-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
				<section
					aria-label="Workbench media asset region"
					className="flex min-h-[18rem] flex-col gap-4 rounded-md border border-workbench-border bg-workbench-inspector p-4"
				>
					<div className="flex items-start justify-between gap-3">
						<WorkbenchRegionHeader
							icon={<FileVideo />}
							kicker="Media asset"
							title="Local media asset"
						/>
						<div className="flex shrink-0 flex-col items-end gap-2">
							<Badge variant="secondary">
								{formatSessionStatus(session.status)}
							</Badge>
							{closeFileVisible ? (
								<Button
									disabled={closeFileDisabled}
									onClick={onCloseFileRequested}
									size="sm"
									type="button"
									variant="outline"
								>
									<X data-icon="inline-start" />
									Close file
								</Button>
							) : null}
						</div>
					</div>
					{session.status === "ready" ? (
						<ActiveMediaAssetSummary session={session} />
					) : (
						<p className="text-sm leading-6 text-muted-foreground">
							Ready to accept one local media asset for the first-slice
							workflow.
						</p>
					)}
				</section>

				<section
					aria-label="Workbench preview region"
					className="min-h-[28rem] rounded-md border border-workbench-border bg-workbench-viewer p-4"
				>
					{session.status !== "ready" ? (
						<NonReadyImportSurface
							localFileInputKey={localFileInputKey}
							onLocalFileDropped={onLocalFileDropped}
							onLocalFileSelected={onLocalFileSelected}
							session={session}
						/>
					) : null}

					{session.status === "ready" && previewSource ? (
						<NativePreviewPlayer
							asset={session.asset}
							onSelectionEndRequested={onSelectionEndRequested}
							onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
							onSelectionResetRequested={onSelectionResetRequested}
							onSelectionStartRequested={onSelectionStartRequested}
							selection={session.selection}
							selectionEditingDisabled={selectionEditingDisabled}
							shortcutsDisabled={selectionEditingDisabled}
							source={previewSource}
						/>
					) : null}
				</section>
			</div>

			<aside
				aria-label="Workbench inspector region"
				className="flex min-w-0 flex-col gap-4"
			>
				{session.status === "ready" ? (
					<>
						<ExportReviewPanel
							asset={session.asset}
							exportState={session.export}
							onCancelExport={onDefaultExportCancelRequested}
							onDownloadGeneratedMedia={onGeneratedMediaDownloadRequested}
							onStartExport={onDefaultExportStartRequested}
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

function WorkbenchRegionHeader({
	icon,
	kicker,
	title,
}: {
	icon: AnalyticsIconElement;
	kicker: string;
	title: string;
}) {
	return (
		<div className="flex min-w-0 items-start gap-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-workbench-border bg-background">
				{cloneElement(icon, {
					"aria-hidden": true,
					className: "size-4",
				})}
			</div>
			<div className="min-w-0">
				<p className="text-xs font-medium uppercase text-muted-foreground">
					{kicker}
				</p>
				<h2
					className="break-words text-base font-semibold leading-tight tracking-tight"
					id="editor-next-import-title"
				>
					{title}
				</h2>
			</div>
		</div>
	);
}

function ActiveMediaAssetSummary({
	session,
}: {
	session: Extract<EditorSessionState, { status: "ready" }>;
}) {
	return (
		<div className="grid gap-3 text-sm">
			<p className="leading-6 text-muted-foreground">
				Loaded for preview, selection, and export.
			</p>
			<dl className="grid gap-2">
				<WorkbenchFact label="Asset" value={session.asset.label} />
				<WorkbenchFact
					label="Selection"
					value={`${formatMediaTime(session.selection.startUs)} - ${formatMediaTime(
						session.selection.endUs,
					)}`}
				/>
				<WorkbenchFact
					label="Duration"
					value={formatMediaTime(session.asset.durationUs)}
				/>
				<WorkbenchFact
					label="Tracks"
					value={`${session.asset.tracks.video.length} video / ${session.asset.tracks.audio.length} audio`}
				/>
			</dl>
		</div>
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

function WorkbenchFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 rounded-md border border-workbench-border bg-background/70 px-3 py-2">
			<dt className="text-xs font-medium uppercase text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 break-words font-mono text-xs leading-5">
				{value}
			</dd>
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

function ExportReviewPanel({
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
	const review = planDefaultExportCapability({
		asset,
		runtime,
		selection,
	});

	return (
		<section
			aria-label="Export review"
			className="overflow-hidden rounded-md border bg-card shadow-sm"
		>
			<div className="flex items-start justify-between gap-3 border-b bg-muted/25 px-4 py-3">
				<h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
						<PackageCheck aria-hidden="true" className="size-4" />
					</span>
					Export review
				</h2>
				<Badge
					className="shrink-0"
					variant={review.supported ? "secondary" : "destructive"}
				>
					{review.supported ? "Ready" : "Blocked"}
				</Badge>
			</div>

			<div className="flex flex-col gap-4 p-4">
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

				<p className="rounded-md border-l-2 border-primary/60 bg-background/70 px-3 py-2 text-sm leading-6 text-muted-foreground">
					{review.reason}
				</p>
				{review.supported ? null : (
					<p className="rounded-md bg-destructive/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
						{review.technicalDetails}
					</p>
				)}
				<ExportJobStatus exportState={exportState} />
				<ExportReviewActions
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

function ExportJobStatus({
	exportState,
}: {
	exportState: ExportSessionState;
}) {
	if (exportState.status === "running") {
		const progressValue = progressPercent(exportState.job.progress);

		return (
			<div className="grid min-w-0 gap-2 rounded-md border bg-background p-3">
				<div className="flex min-w-0 items-center justify-between gap-3 text-sm">
					<span className="font-medium">
						{formatExportProgressPhase(exportState.job.progress.phase)}
					</span>
					<Badge className="max-w-32 truncate" variant="outline">
						{exportState.job.id}
					</Badge>
				</div>
				<Progress aria-label="Export progress" value={progressValue} />
				{exportState.job.cancelSupported ? null : (
					<p className="text-xs text-muted-foreground">
						Cancellation unavailable
					</p>
				)}
			</div>
		);
	}

	if (exportState.status === "succeeded") {
		return (
			<div className="grid min-w-0 gap-3 rounded-md border bg-background p-3 text-sm">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<span className="min-w-0 font-medium">Export complete</span>
					<Badge
						className="shrink-0"
						variant={exportState.delivered ? "secondary" : "outline"}
					>
						{exportState.delivered ? "Delivered" : "Ready to download"}
					</Badge>
				</div>
				<p className="min-w-0 break-all rounded-md bg-muted/45 px-2 py-1.5 font-mono text-xs leading-5 text-muted-foreground">
					{exportState.generatedMedia.fileName}
				</p>
			</div>
		);
	}

	if (exportState.status === "failed") {
		return (
			<div className="grid min-w-0 gap-1 rounded-md border border-destructive/40 bg-background p-3 text-sm">
				<span className="font-medium text-destructive">
					{exportState.message}
				</span>
				{exportState.technicalDetails ? (
					<p className="break-words text-xs text-muted-foreground">
						{exportState.technicalDetails}
					</p>
				) : null}
			</div>
		);
	}

	if (exportState.status === "cancelled") {
		return (
			<div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
				Export cancelled.
			</div>
		);
	}

	return null;
}

function ExportReviewActions({
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
	if (exportState.status === "running") {
		if (!exportState.job.cancelSupported) {
			return null;
		}

		return (
			<Button
				className="w-full"
				onClick={onCancelExport}
				type="button"
				variant="outline"
			>
				<Square data-icon="inline-start" />
				Cancel export
			</Button>
		);
	}

	if (exportState.status === "succeeded") {
		return (
			<Button
				className="w-full"
				onClick={() => onDownloadGeneratedMedia(exportState.generatedMedia)}
				type="button"
			>
				<Download data-icon="inline-start" />
				Download generated media
			</Button>
		);
	}

	return (
		<Button
			className="w-full"
			disabled={!reviewSupported}
			onClick={onStartExport}
			type="button"
		>
			<PlayCircle data-icon="inline-start" />
			Start default export
		</Button>
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
		<div className="grid min-w-0 gap-1 rounded-md border bg-background/70 px-3 py-2.5 text-sm">
			<span className="text-xs font-medium uppercase text-muted-foreground">
				{label}
			</span>
			<span className="min-w-0 break-words font-mono leading-5 text-foreground">
				{value}
			</span>
		</div>
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
