import {
	AlertTriangle,
	AudioLines,
	Brackets,
	FileVideo,
	PackageCheck,
	Scissors,
	ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EditorSessionState } from "@/editor-core/session";
import type {
	EditorSessionShellProps,
	EditorWorkbenchFrameProps,
	UnsupportedRuntimeStateProps,
} from "./editor-workbench.types";
import { formatMediaTime } from "./media-time-presentation";

type NonReadyEditorSession = Exclude<
	EditorSessionShellProps["session"],
	{ status: "ready" }
>;

export function EditorWorkbenchFrame({
	activeAsset,
	children,
	previewStatus,
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
					<TopBarMediaAssetSummary
						activeAsset={activeAsset}
						previewStatus={previewStatus}
					/>
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
				<div
					className={`min-h-0 min-w-0 overflow-auto overscroll-contain bg-workbench p-3 md:p-4 ${
						status === "ready" ? "xl:overflow-hidden xl:p-0" : ""
					}`}
				>
					{children}
				</div>
			</div>
		</main>
	);
}

export function UnsupportedRuntimeState({
	session,
}: UnsupportedRuntimeStateProps) {
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
								The editor workbench requires a supported runtime before a local
								media asset can be imported.
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

export function EditorSessionShell({
	audioPanel,
	exportInspector,
	localFileInputKey,
	mediaAssetContext,
	onLocalFileDropped,
	onLocalFileSelected,
	previewPlayer,
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

	return (
		<section
			aria-label="Editor workbench session"
			className="min-h-[calc(100vh-5rem)] xl:h-full xl:min-h-0 xl:overflow-hidden"
		>
			<ResizablePanelGroup
				aria-label="Ready workbench layout"
				autoSaveId="editor-next-ready-workbench"
				className="min-h-[calc(100vh-5rem)] min-w-0 flex-col gap-3 xl:h-full xl:min-h-0 xl:flex-row xl:gap-0 xl:overflow-hidden"
				direction="horizontal"
			>
				<ResizablePanel
					className="min-w-0 xl:min-h-0"
					defaultSize={24}
					id="editor-next-inspector-pane"
					maxSize={42}
					minSize={18}
					order={1}
				>
					<WorkbenchInspectorTabs
						audioPanel={audioPanel}
						exportInspector={exportInspector}
						mediaAssetContext={mediaAssetContext}
					/>
				</ResizablePanel>

				<ResizableHandle
					aria-label="Resize inspector panel"
					className="hidden bg-workbench-border-strong xl:flex"
				/>

				<ResizablePanel
					className="min-w-0 xl:min-h-0"
					defaultSize={76}
					id="editor-next-preview-pane"
					minSize={50}
					order={2}
				>
					{previewPlayer}
				</ResizablePanel>
			</ResizablePanelGroup>
		</section>
	);
}

function WorkbenchInspectorTabs({
	audioPanel,
	exportInspector,
	mediaAssetContext,
}: Pick<
	EditorSessionShellProps,
	"audioPanel" | "exportInspector" | "mediaAssetContext"
>) {
	return (
		<aside
			aria-label="Workbench inspector region"
			className="flex min-w-0 flex-col overflow-visible overscroll-contain xl:h-full xl:min-h-0 xl:overflow-hidden xl:bg-workbench-inspector xl:[contain:layout_paint]"
		>
			<Tabs
				className="flex min-h-0 flex-1 flex-col gap-0 xl:h-full"
				defaultValue="media"
			>
				<div className="flex h-8 min-w-0 shrink-0 items-center justify-between border-b border-workbench-border bg-workbench">
					<TabsList
						aria-label="Workbench inspector tabs"
						className="flex h-full min-w-0 items-stretch justify-start rounded-none bg-transparent p-0"
					>
						<WorkbenchInspectorTabTrigger value="media">
							<FileVideo data-icon="inline-start" />
							<span>Media</span>
						</WorkbenchInspectorTabTrigger>
						<WorkbenchInspectorTabTrigger value="audio">
							<AudioLines data-icon="inline-start" />
							<span>Audio</span>
						</WorkbenchInspectorTabTrigger>
						<WorkbenchInspectorTabTrigger value="export">
							<PackageCheck data-icon="inline-start" />
							<span>Export</span>
						</WorkbenchInspectorTabTrigger>
					</TabsList>
				</div>
				<TabsContent
					className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
					value="media"
				>
					{mediaAssetContext}
				</TabsContent>
				<TabsContent
					className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
					value="audio"
				>
					{audioPanel}
				</TabsContent>
				<TabsContent
					className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
					value="export"
				>
					{exportInspector}
				</TabsContent>
			</Tabs>
		</aside>
	);
}

function WorkbenchInspectorTabTrigger({
	children,
	value,
}: {
	children: ReactNode;
	value: string;
}) {
	return (
		<TabsTrigger
			className="h-full min-w-0 touch-none rounded-none border-y-0 border-l-0 border-r border-workbench-border bg-workbench px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-workbench-hover hover:text-foreground data-[state=active]:bg-workbench-hover data-[state=active]:text-foreground data-[state=active]:shadow-none [&_svg]:size-3.5 [&_svg]:text-workbench-selected [&_svg]:opacity-70 data-[state=active]:[&_svg]:opacity-100"
			value={value}
		>
			{children}
		</TabsTrigger>
	);
}

function TopBarMediaAssetSummary({
	activeAsset,
	previewStatus,
}: Pick<EditorWorkbenchFrameProps, "activeAsset" | "previewStatus">) {
	if (!activeAsset) {
		return (
			<div
				aria-label="Top bar media asset summary"
				className="hidden min-w-0 md:block"
			/>
		);
	}

	const primaryVideo = activeAsset.tracks.video[0];
	const resolution =
		primaryVideo?.width && primaryVideo.height
			? `${primaryVideo.width} x ${primaryVideo.height}`
			: "Resolution unknown";
	const playheadUs = previewStatus?.playheadUs ?? 0;
	const selectionDurationUs =
		previewStatus?.selectionDurationUs ?? activeAsset.durationUs;

	return (
		<div
			aria-label="Top bar media asset summary"
			className="hidden min-w-0 items-center justify-center gap-2 overflow-hidden font-mono text-[11px] text-muted-foreground lg:flex"
		>
			<dl
				aria-label="Top bar media-time readouts"
				className="flex min-w-0 items-center gap-2"
			>
				<dt className="sr-only">Playhead</dt>
				<dd className="whitespace-nowrap text-foreground">
					{formatMediaTime(playheadUs)}
				</dd>
				<span aria-hidden="true" className="text-workbench-border-strong">
					/
				</span>
				<dt className="sr-only">Duration</dt>
				<dd className="whitespace-nowrap">
					{formatMediaTime(activeAsset.durationUs)}
				</dd>
				<span aria-hidden="true" className="text-workbench-border-strong">
					|
				</span>
				<dt className="sr-only">Selection duration</dt>
				<dd className="flex items-center gap-1.5 whitespace-nowrap text-foreground">
					<Brackets
						aria-hidden="true"
						className="size-3.5 shrink-0 text-workbench-selected"
					/>
					{formatMediaTime(selectionDurationUs)}
				</dd>
			</dl>
			<span aria-hidden="true" className="text-workbench-border-strong">
				|
			</span>
			<span className="whitespace-nowrap">{resolution}</span>
			<span aria-hidden="true" className="text-workbench-border-strong">
				|
			</span>
			<span className="whitespace-nowrap">
				{formatTopBarFrameTiming(activeAsset)}
			</span>
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
	onLocalFileDropped: EditorSessionShellProps["onLocalFileDropped"];
	onLocalFileSelected: EditorSessionShellProps["onLocalFileSelected"];
	session: NonReadyEditorSession;
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
						Local media file
					</label>
					<Input
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

function workbenchNonReadyStateCopy(session: NonReadyEditorSession) {
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
					"Choose or drop one local media file to create a media asset draft.",
				title: "No media asset loaded",
			};
		case "failure":
			return {
				description:
					"Choose another local media file after reviewing the analysis details below.",
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

function RuntimeChecksPanel({
	session,
}: {
	session: EditorSessionState;
}) {
	return (
		<section className="flex flex-col gap-3 rounded-md border bg-card p-4">
			<h2 className="text-sm font-semibold tracking-tight">Browser support</h2>
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

function SessionStatusLine({ session }: { session: NonReadyEditorSession }) {
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

function formatTopBarFrameTiming({
	frameTiming,
}: NonNullable<EditorWorkbenchFrameProps["activeAsset"]>): string {
	const fps = Number.isInteger(frameTiming.fps)
		? String(frameTiming.fps)
		: frameTiming.fps.toFixed(2);

	return frameTiming.source === "estimated"
		? `${fps} fps estimated`
		: `${fps} fps`;
}
