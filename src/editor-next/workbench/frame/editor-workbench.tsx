import {
	AlertCircle,
	AlertTriangle,
	FileVideo,
	Loader2,
	Scissors,
	Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ReadyMediaAsset } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorSessionState } from "@/editor-core/session";
import { cn } from "@/lib/utils";

export type EditorWorkbenchFrameProps = {
	activeAsset: ReadyMediaAsset | null;
	children: ReactNode;
	runtime: RuntimeSupport;
};

export type UnsupportedRuntimeStateProps = {
	session: Extract<EditorSessionState, { status: "unsupported-runtime" }>;
};

export type EditorSessionShellProps = {
	localFileInputKey: number;
	onLocalFileDropped: (file: File) => void;
	onLocalFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
	previewPlayer: ReactNode;
	session: Exclude<EditorSessionState, { status: "unsupported-runtime" }>;
};

type NonReadyEditorSession = Exclude<
	EditorSessionShellProps["session"],
	{ status: "ready" }
>;

const supportedFormatLabels = ["MP4", "AVI", "MOV", "MKV", "WebM"];
const supportedVideoExtensions = [
	".mp4",
	".avi",
	".mov",
	".mkv",
	".webm",
	".m4v",
	".3gp",
];
const supportedVideoAcceptAttribute = [
	"video/*",
	...supportedVideoExtensions,
].join(",");
export function EditorWorkbenchFrame({
	activeAsset,
	children,
	runtime,
}: EditorWorkbenchFrameProps) {
	return (
		<main className="workbench dark cinema-workbench">
			{!activeAsset && (
				<header aria-label="Editor workbench top bar" className="cinema-header">
					<div className="cinema-brand">
						<Scissors aria-hidden="true" className="cinema-mark" />
						<h1>YAFFW</h1>
					</div>
				</header>
			)}
			<div className="cinema-stage" data-editing={activeAsset !== null}>
				{children}
			</div>
			{!runtime.supported && (
				<footer className="cinema-footer">
					<span>Runtime blocked</span>
				</footer>
			)}
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
	localFileInputKey,
	onLocalFileDropped,
	onLocalFileSelected,
	previewPlayer,
	session,
}: EditorSessionShellProps) {
	if (session.status !== "ready") {
		return (
			<section
				aria-label="Editor workbench session"
				className="grid h-full min-h-[28rem]"
			>
				<section
					aria-label="Workbench center region"
					className="h-full min-h-[28rem] overflow-hidden bg-workbench-viewer"
				>
					<div aria-label="Workbench preview region" className="h-full">
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
		<section aria-label="Editor workbench session" className="cinema-session">
			{previewPlayer}
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
	onLocalFileDropped: EditorSessionShellProps["onLocalFileDropped"];
	onLocalFileSelected: EditorSessionShellProps["onLocalFileSelected"];
	session: NonReadyEditorSession;
}) {
	const copy = workbenchNonReadyStateCopy(session);
	const isProcessing = session.status === "loading";
	const [dragState, setDragState] = useState<"idle" | "active" | "reject">(
		"idle",
	);
	useEffect(() => {
		let dragDepth = 0;
		function resetDragState() {
			dragDepth = 0;
			setDragState("idle");
		}
		function handleDragEnter(event: DragEvent) {
			if (!isFileTransfer(event.dataTransfer)) return;
			event.preventDefault();
			if (!session.importEnabled) return;
			dragDepth += 1;
			setDragState(
				isRejectedDataTransfer(event.dataTransfer) ? "reject" : "active",
			);
		}
		function handleDragOver(event: DragEvent) {
			if (!isFileTransfer(event.dataTransfer)) return;
			event.preventDefault();
			const rejected = isRejectedDataTransfer(event.dataTransfer);
			event.dataTransfer.dropEffect =
				!session.importEnabled || rejected ? "none" : "copy";
			if (session.importEnabled) setDragState(rejected ? "reject" : "active");
		}
		function handleDragLeave() {
			dragDepth = Math.max(0, dragDepth - 1);
			if (dragDepth === 0) setDragState("idle");
		}
		function handleDrop(event: DragEvent) {
			if (!isFileTransfer(event.dataTransfer)) return;
			event.preventDefault();
			resetDragState();
			const file = event.dataTransfer.files[0];
			if (session.importEnabled && file && isSupportedVideoFile(file)) {
				onLocalFileDropped(file);
			}
		}

		resetDragState();
		// Listen only while the import surface is mounted, including the page chrome.
		window.addEventListener("dragenter", handleDragEnter, true);
		window.addEventListener("dragover", handleDragOver, true);
		window.addEventListener("dragleave", handleDragLeave, true);
		window.addEventListener("drop", handleDrop, true);
		window.addEventListener("dragend", resetDragState);
		window.addEventListener("blur", resetDragState);
		return () => {
			window.removeEventListener("dragenter", handleDragEnter, true);
			window.removeEventListener("dragover", handleDragOver, true);
			window.removeEventListener("dragleave", handleDragLeave, true);
			window.removeEventListener("drop", handleDrop, true);
			window.removeEventListener("dragend", resetDragState);
			window.removeEventListener("blur", resetDragState);
		};
	}, [session.importEnabled, onLocalFileDropped]);

	return (
		<div className="cinema-import">
			<div className="flex w-full max-w-xl flex-col gap-8">
				<header className="grid max-w-xl gap-4 text-left">
					<h3 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
						{copy.title}
					</h3>
					{copy.description && (
						<p className="text-xs leading-5 text-muted-foreground">
							{copy.description}
						</p>
					)}
				</header>
				<label
					aria-disabled={!session.importEnabled}
					aria-busy={isProcessing}
					className={cn(
						"relative grid min-h-48 cursor-pointer overflow-hidden rounded-md border border-dashed border-workbench-border-strong bg-workbench-hover px-6 py-8 text-left transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-workbench-focus",
						dragState === "active" &&
							"border-solid border-workbench-selected bg-workbench-selected/5",
						dragState === "reject" &&
							"border-solid border-destructive bg-destructive/10",
						isProcessing && "cursor-wait border-solid bg-workbench-disabled/25",
						!isProcessing &&
							dragState === "idle" &&
							"hover:border-workbench-selected/70 hover:bg-workbench-hover/25",
					)}
					data-testid="editor-next-drop-zone"
					htmlFor="editor-next-local-file"
				>
					<Input
						accept={supportedVideoAcceptAttribute}
						aria-label="Local media file"
						className="sr-only"
						disabled={!session.importEnabled}
						id="editor-next-local-file"
						key={localFileInputKey}
						onChange={onLocalFileSelected}
						type="file"
					/>
					<div className="grid justify-items-start gap-4">
						<div
							className={cn(
								"grid size-9 place-items-center text-muted-foreground transition-[color,transform] duration-200",
								dragState === "reject" && "text-destructive",
								dragState === "active" &&
									"scale-[1.04] text-workbench-selected",
								isProcessing && "text-workbench-selected",
							)}
						>
							<ImportSurfaceIcon
								dragState={dragState}
								isProcessing={isProcessing}
							/>
						</div>

						<div className="space-y-1.5">
							<h4
								aria-live="polite"
								className={cn(
									"text-sm font-semibold tracking-[-0.01em] transition-colors duration-200",
									dragState === "reject" && "text-destructive",
									dragState === "active" && "text-workbench-selected",
									isProcessing && "text-workbench-selected",
								)}
							>
								{dragState === "reject"
									? "Invalid file type"
									: dragState === "active"
										? "Release to open"
										: isProcessing
											? "Opening video…"
											: "Drop your video or click to browse"}
							</h4>
							{dragState === "reject" && (
								<p className="text-xs leading-5 text-muted-foreground">
									Choose a video file.
								</p>
							)}
						</div>

						{!isProcessing ? (
							<p className="tabular-nums text-[9px] font-medium tracking-[0.08em] text-muted-foreground">
								{supportedFormatLabels.join("  ·  ")}
							</p>
						) : null}
					</div>
				</label>
				{(session.status === "loading" || session.status === "failure") && (
					<div className="px-0.5">
						<SessionStatusLine session={session} />
					</div>
				)}
			</div>
		</div>
	);
}

function ImportSurfaceIcon({
	dragState,
	isProcessing,
}: {
	dragState: "idle" | "active" | "reject";
	isProcessing: boolean;
}) {
	if (dragState === "reject") {
		return <AlertCircle aria-hidden="true" className="size-6" />;
	}

	if (dragState === "active") {
		return <FileVideo aria-hidden="true" className="size-6" />;
	}

	if (isProcessing) {
		return <Loader2 aria-hidden="true" className="size-6 animate-spin" />;
	}

	return <Upload aria-hidden="true" className="size-6" />;
}

function isFileTransfer(
	dataTransfer: DataTransfer | null,
): dataTransfer is DataTransfer {
	return (
		!!dataTransfer &&
		(Array.from(dataTransfer.types ?? []).includes("Files") ||
			Array.from(dataTransfer.items ?? []).some(
				(item) => item.kind === "file",
			) ||
			dataTransfer.files?.length > 0)
	);
}

function isRejectedDataTransfer(dataTransfer: DataTransfer): boolean {
	const fileItems = Array.from(dataTransfer.items).filter(
		(item) => item.kind === "file",
	);

	return fileItems.some(
		(item) => item.type !== "" && !item.type.startsWith("video/"),
	);
}

function isSupportedVideoFile(file: File): boolean {
	if (file.type.startsWith("video/")) {
		return true;
	}

	const normalizedName = file.name.toLowerCase();
	return supportedVideoExtensions.some((extension) =>
		normalizedName.endsWith(extension),
	);
}

function workbenchNonReadyStateCopy(session: NonReadyEditorSession) {
	switch (session.status) {
		case "closed":
			return {
				description: "Reload the page to open another video.",
				title: "Video closed",
			};
		case "empty":
			return {
				description: null,
				title: "Open a video",
			};
		case "failure":
			return {
				description: "Try another video.",
				title: "Couldn’t open video",
			};
		case "loading":
			return {
				description: null,
				title: "Opening video",
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
			<p className="text-xs leading-5 text-muted-foreground">
				{session.draft.label}
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

	return null;
}
