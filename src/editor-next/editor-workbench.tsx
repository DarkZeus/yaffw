import {
	AlertTriangle,
	BarChart3,
	FileVideo,
	Monitor,
	PackageCheck,
	PlayCircle,
	Scissors,
	ShieldCheck,
} from "lucide-react";
import { type ReactElement, cloneElement } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { EditorSessionState } from "@/editor-core/session";
import type {
	EditorSessionShellProps,
	EditorWorkbenchFrameProps,
	UnsupportedRuntimeStateProps,
} from "./editor-workbench.types";

type AnalyticsIconElement = ReactElement<{
	"aria-hidden"?: boolean;
	className?: string;
}>;

type NonReadyEditorSession = Exclude<
	EditorSessionShellProps["session"],
	{ status: "ready" }
>;

export function EditorWorkbenchFrame({
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
					<TopBarMediaAssetSummary activeAsset={activeAsset} />
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
			className="grid min-h-[calc(100vh-5rem)] grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[16.25rem_minmax(30rem,1fr)_19.75rem] xl:grid-rows-[minmax(0,1fr)_2.75rem_38%] xl:gap-0 xl:overflow-hidden"
		>
			<section
				aria-label="Workbench media asset region"
				className="flex min-w-0 flex-col overflow-x-hidden overscroll-contain xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-r xl:border-workbench-border-strong xl:bg-workbench-inspector xl:[contain:layout_paint]"
			>
				{mediaAssetContext}
			</section>

			{previewPlayer}

			<aside
				aria-label="Workbench inspector region"
				className="flex min-w-0 flex-col overflow-x-hidden overscroll-contain xl:col-start-3 xl:row-start-1 xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-workbench-border-strong xl:bg-workbench-inspector xl:[contain:layout_paint]"
			>
				{exportInspector}
			</aside>
		</section>
	);
}

function TopBarMediaAssetSummary({
	activeAsset,
}: Pick<EditorWorkbenchFrameProps, "activeAsset">) {
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

	return (
		<div
			aria-label="Top bar media asset summary"
			className="hidden min-w-0 items-center justify-center gap-3 font-mono text-[11px] text-muted-foreground lg:flex"
		>
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
