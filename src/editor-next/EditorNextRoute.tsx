import { AlertTriangle, CheckCircle2, FileVideo } from "lucide-react";
import { type ChangeEvent, type DragEvent, useMemo, useReducer } from "react";

import {
	type LocalMediaAssetInspector,
	analyzeLocalMediaAssetDraft,
} from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
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

	async function importLocalFile(file: File) {
		if (!session.importEnabled) {
			return;
		}

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
		});

		if (result.status === "ready") {
			dispatch({
				asset: result.asset,
				selection: result.selection,
				type: "asset.ready",
			});
			return;
		}

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
	session: Exclude<EditorSessionState, { status: "unsupported-runtime" }>;
};

function EditorSessionShell({
	onLocalFileDropped,
	onLocalFileSelected,
	session,
}: EditorSessionShellProps) {
	return (
		<section
			aria-labelledby="editor-next-import-title"
			className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
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
			</div>

			<aside className="flex flex-col gap-3 rounded-md border bg-card p-4">
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
			</aside>
		</section>
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
						<dd>{formatMediaTime(session.selection.endUs)}</dd>
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
