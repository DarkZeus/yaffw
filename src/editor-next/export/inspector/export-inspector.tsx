import { BadgeCheck, Download, Gauge, PlayCircle, Square } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { GeneratedMedia } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type {
	ExportInspectorActionViewModel,
	ExportInspectorCapabilityViewModel,
	ExportInspectorRuntimeCheckViewModel,
	ExportInspectorStatusViewModel,
} from "../types/export-inspector-presenter.types";
import type { ExportInspectorPanelProps } from "../types/export-inspector.types";
import { createExportInspectorViewModel } from "./export-inspector-presenter";
import { OutputSettingsPanel } from "./output-settings-panel";

export function ExportInspectorPanel({
	asset,
	exportState,
	onCancelExport,
	onDownloadGeneratedMedia,
	onApplyOutputSettings,
	onStartExport,
	outputSettings,
	runtime,
	selection,
}: ExportInspectorPanelProps) {
	const viewModel = createExportInspectorViewModel({
		asset,
		exportState,
		outputSettings,
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
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
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
							variant={
								viewModel.badge.tone === "ready" ? "secondary" : "destructive"
							}
						>
							{viewModel.badge.label}
						</Badge>
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
				<OutputSettingsPanel
					asset={asset}
					exportRunning={exportState.status === "running"}
					onApplyOutputSettings={onApplyOutputSettings}
					outputSettings={outputSettings}
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
					<span className="min-w-0 truncate">Documented output profile</span>
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
		);
	}

	if (action.kind === "download") {
		return (
			<ExportActionShell>
				<Button
					className="h-8 w-full"
					onClick={() => onDownloadGeneratedMedia(action.generatedMedia)}
					type="button"
				>
					<Download data-icon="inline-start" />
					{action.label}
				</Button>
			</ExportActionShell>
		);
	}

	if (action.kind === "none") {
		return null;
	}

	return (
		<ExportActionShell>
			<Button
				className="h-8 w-full bg-workbench-progress text-workbench-selected-foreground hover:bg-workbench-progress/90"
				disabled={action.disabled}
				onClick={onStartExport}
				type="button"
			>
				<PlayCircle data-icon="inline-start" />
				{action.label}
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

function formatRuntimeSummary(runtime: RuntimeSupport): string {
	return runtime.supported ? "WebCodecs ready" : "Runtime blocked";
}
