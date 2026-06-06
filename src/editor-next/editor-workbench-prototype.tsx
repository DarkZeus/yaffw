// Throwaway prototype: resolved balanced Resolve Edit-style ready workbench, with earlier variants still switchable via ?variant=.
import {
	ArrowLeft,
	ArrowRight,
	AudioLines,
	AudioWaveform,
	BadgeCheck,
	CircleDot,
	Download,
	FileVideo,
	Film,
	Gauge,
	Info,
	Maximize2,
	MonitorUp,
	PanelLeftClose,
	PanelRightClose,
	Pause,
	Play,
	RotateCcw,
	Scissors,
	Settings2,
	ShieldCheck,
	SkipBack,
	SkipForward,
	Sparkles,
	TimerReset,
	Volume2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PrototypeVariantKey = "R" | "A" | "B" | "C";

type PrototypeVariant = {
	key: PrototypeVariantKey;
	name: string;
};

const variants: PrototypeVariant[] = [
	{ key: "R", name: "Resolved Edit Workbench" },
	{ key: "A", name: "Classic Edit Workbench" },
	{ key: "B", name: "Viewer Priority Workbench" },
	{ key: "C", name: "Timeline Console Workbench" },
];

const variantKeys = variants.map((variant) => variant.key);

const prototypeState = {
	asset: {
		audioTracks: [
			{ label: "Voice", language: "en", status: "ready" },
			{ label: "Desktop", language: "und", status: "ready" },
		],
		codec: "H.264 / AAC",
		duration: "00:13.500",
		fileName: "stalker-patch-1.5-teaser.mp4",
		frameTiming: "60 fps known",
		resolution: "3840 x 2160",
		size: "30.0 MB",
	},
	export: {
		delivery: "Not delivered",
		output: "MP4 / H.264 / AAC",
		precision: "Best effort",
		progress: "Ready",
		strategy: "Default browser export",
	},
	playhead: "00:04.280",
	runtime: "Chromium WebCodecs ready",
	selection: {
		coverage: "55%",
		duration: "00:07.420",
		end: "00:09.860",
		start: "00:02.440",
	},
};

const waveformLanes = [
	{
		accent: "bg-emerald-300",
		label: "Voice",
		meta: "en · AAC · stereo",
		opacity: "opacity-95",
		samples: [
			20, 24, 18, 28, 34, 22, 38, 42, 27, 30, 54, 36, 26, 48, 34, 22, 28, 40,
			52, 32, 26, 30, 22, 18, 24, 36, 50, 40, 28, 26, 30, 44,
		],
	},
	{
		accent: "bg-cyan-300",
		label: "Desktop",
		meta: "und · AAC · stereo",
		opacity: "opacity-70",
		samples: [
			12, 14, 18, 16, 20, 26, 22, 20, 24, 28, 26, 20, 18, 22, 24, 30, 34, 26,
			24, 22, 20, 18, 22, 26, 30, 28, 22, 20, 18, 16, 20, 24,
		],
	},
];

const frameImage = "/editor-workbench-prototype-frame.jpg";

export function EditorWorkbenchPrototype() {
	const [variantKey, setVariantKey] = useState<PrototypeVariantKey>(() =>
		readVariantFromUrl(),
	);
	const activeVariant =
		variants.find((variant) => variant.key === variantKey) ?? variants[0];

	const setVariant = useCallback((nextVariant: PrototypeVariantKey) => {
		const nextSearchParams = new URLSearchParams(window.location.search);
		nextSearchParams.set("variant", nextVariant);
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}?${nextSearchParams.toString()}`,
		);
		setVariantKey(nextVariant);
	}, []);

	const cycleVariant = useCallback(
		(direction: -1 | 1) => {
			const currentIndex = variantKeys.indexOf(variantKey);
			const nextIndex =
				(currentIndex + direction + variantKeys.length) % variantKeys.length;
			setVariant(variantKeys[nextIndex]);
		},
		[setVariant, variantKey],
	);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			const target = event.target;
			const isTyping =
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);

			if (isTyping) {
				return;
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				cycleVariant(-1);
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				cycleVariant(1);
			}
		}

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [cycleVariant]);

	return (
		<main className="h-screen min-h-[720px] overflow-hidden bg-[#0c0b0a] text-stone-100">
			<style>
				{`
					[data-sidebar="rail"],
					[data-sidebar="trigger"] {
						display: none !important;
					}
				`}
			</style>
			{variantKey === "R" ? <VariantResolvedWorkbench /> : null}
			{variantKey === "A" ? <VariantClassicEdit /> : null}
			{variantKey === "B" ? <VariantViewerPriority /> : null}
			{variantKey === "C" ? <VariantTimelineConsole /> : null}
			<PrototypeStateOverlay variant={activeVariant} />
			<PrototypeSwitcher
				current={activeVariant}
				onNext={() => cycleVariant(1)}
				onPrevious={() => cycleVariant(-1)}
			/>
		</main>
	);
}

function VariantResolvedWorkbench() {
	return (
		<section className="grid h-full grid-rows-[42px_minmax(0,1fr)_40px_38%] bg-[#0b0b0b]">
			<WorkbenchTopBar density="compact" />
			<div className="grid min-h-0 grid-cols-[64px_260px_minmax(0,1fr)_316px] border-y border-[#292521]">
				<IconRail />
				<LeftAssetPanel tone="classic" />
				<div className="min-w-0 border-x border-[#292521] bg-[#11100e]">
					<ViewerPanel chrome="classic" />
				</div>
				<RightExportInspector tone="classic" />
			</div>
			<TransportStrip mode="classic" />
			<TimelinePanel mode="resolved" />
		</section>
	);
}

function VariantClassicEdit() {
	return (
		<section className="grid h-full grid-rows-[42px_minmax(0,1fr)_40px_38%] bg-[#0b0b0b]">
			<WorkbenchTopBar density="compact" />
			<div className="grid min-h-0 grid-cols-[276px_minmax(0,1fr)_316px] border-y border-[#292521]">
				<LeftAssetPanel tone="classic" />
				<div className="min-w-0 border-x border-[#292521] bg-[#11100e]">
					<ViewerPanel chrome="classic" />
				</div>
				<RightExportInspector tone="classic" />
			</div>
			<TransportStrip mode="classic" />
			<TimelinePanel mode="classic" />
		</section>
	);
}

function VariantViewerPriority() {
	return (
		<section className="grid h-full grid-rows-[48px_minmax(0,1fr)_42%] bg-[#0e0d0b]">
			<WorkbenchTopBar density="roomy" />
			<div className="grid min-h-0 grid-cols-[72px_248px_minmax(0,1fr)_288px] border-y border-[#2a261f]">
				<IconRail />
				<LeftAssetPanel tone="rail" />
				<div className="grid min-w-0 grid-rows-[minmax(0,1fr)_46px] bg-[#11100d]">
					<ViewerPanel chrome="cinema" />
					<TransportStrip mode="cinema" />
				</div>
				<RightExportInspector tone="rail" />
			</div>
			<TimelinePanel mode="cinema" />
		</section>
	);
}

function VariantTimelineConsole() {
	return (
		<section className="grid h-full grid-rows-[44px_minmax(0,58%)_minmax(260px,42%)] bg-[#0a0a09]">
			<WorkbenchTopBar density="compact" />
			<div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)_300px] border-y border-[#2b2720]">
				<LeftAssetPanel tone="console" />
				<div className="grid min-w-0 grid-rows-[minmax(0,1fr)_48px] border-x border-[#2b2720] bg-[#100f0d]">
					<ViewerPanel chrome="console" />
					<TransportStrip mode="console" />
				</div>
				<RightExportInspector tone="console" />
			</div>
			<TimelinePanel mode="console" />
		</section>
	);
}

function WorkbenchTopBar({ density }: { density: "compact" | "roomy" }) {
	return (
		<header
			className={cn(
				"grid grid-cols-[minmax(210px,auto)_minmax(0,1fr)_auto] items-center border-b border-[#2c2823] bg-[#11100f] px-3 text-xs",
				density === "roomy" ? "h-12" : "h-[42px]",
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<div className="flex size-7 items-center justify-center rounded border border-[#3b352c] bg-[#171511] text-amber-300">
					<Scissors className="size-4" />
				</div>
				<div className="min-w-0">
					<div className="text-[13px] font-semibold leading-tight text-stone-100">
						YAFFW
					</div>
					<div className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
						Editor workbench prototype
					</div>
				</div>
			</div>
			<div className="flex min-w-0 items-center justify-center gap-3 px-3 font-mono text-[11px] text-stone-400">
				<span className="truncate">{prototypeState.asset.fileName}</span>
				<span className="h-3 w-px bg-[#3b352d]" />
				<span>{prototypeState.asset.resolution}</span>
				<span>{prototypeState.asset.frameTiming}</span>
			</div>
			<div className="flex items-center justify-end gap-2">
				<Badge
					className="border-[#2c4936] bg-[#102017] text-emerald-200"
					variant="outline"
				>
					<ShieldCheck className="size-3" />
					WebCodecs
				</Badge>
				<Button
					className="h-7 border-[#3b352d] bg-[#171511] px-2 text-xs text-stone-200 hover:bg-[#211e19]"
					size="sm"
					type="button"
					variant="outline"
				>
					Shortcuts
				</Button>
			</div>
		</header>
	);
}

function LeftAssetPanel({ tone }: { tone: "classic" | "rail" | "console" }) {
	return (
		<aside
			className={cn(
				"min-h-0 overflow-hidden border-r border-[#2b2721] bg-[#0f0e0d]",
				tone === "console" ? "bg-[#0c0c0b]" : null,
			)}
		>
			<PanelHeader
				icon={<FileVideo className="size-4" />}
				title="Media asset"
				trailing={<PanelLeftClose className="size-4 text-stone-500" />}
			/>
			<div className="flex h-[calc(100%-42px)] flex-col overflow-y-auto px-3 py-3">
				<SectionLabel>Source</SectionLabel>
				<div className="mb-4 space-y-2 rounded border border-[#29251f] bg-[#15130f] p-3">
					<div className="truncate text-sm font-medium text-stone-100">
						{prototypeState.asset.fileName}
					</div>
					<div className="grid grid-cols-2 gap-2 text-[11px] text-stone-400">
						<Metric label="Size" value={prototypeState.asset.size} />
						<Metric label="Duration" value={prototypeState.asset.duration} />
						<Metric label="Codec" value={prototypeState.asset.codec} />
						<Metric label="Frames" value={prototypeState.asset.frameTiming} />
					</div>
				</div>

				<SectionLabel>Tracks</SectionLabel>
				<div className="mb-4 space-y-2">
					<TrackRow
						icon={<Film className="size-4" />}
						label="Video 1"
						meta={prototypeState.asset.resolution}
						status="Previewable"
					/>
					{prototypeState.asset.audioTracks.map((track) => (
						<TrackRow
							icon={<AudioLines className="size-4" />}
							key={track.label}
							label={track.label}
							meta={track.language}
							status={track.status}
						/>
					))}
				</div>

				<SectionLabel>Selection</SectionLabel>
				<div className="grid grid-cols-2 gap-2 text-[11px]">
					<TimeBox label="Start" value={prototypeState.selection.start} />
					<TimeBox label="End" value={prototypeState.selection.end} />
					<TimeBox label="Duration" value={prototypeState.selection.duration} />
					<TimeBox label="Coverage" value={prototypeState.selection.coverage} />
				</div>

				<div className="mt-auto pt-4">
					<div className="rounded border border-[#2d2821] bg-[#15130f] p-3 text-[11px] leading-5 text-stone-400">
						<div className="mb-1 flex items-center gap-2 text-stone-200">
							<Info className="size-3.5 text-amber-300" />
							Workbench intent
						</div>
						One active media asset, one shared playhead, one exported selection.
						No bins, no project timeline, no composition model.
					</div>
				</div>
			</div>
		</aside>
	);
}

function RightExportInspector({
	tone,
}: { tone: "classic" | "rail" | "console" }) {
	return (
		<aside
			className={cn(
				"min-h-0 overflow-hidden border-l border-[#2b2721] bg-[#0f0e0d]",
				tone === "rail" ? "bg-[#12100d]" : null,
			)}
		>
			<PanelHeader
				icon={<MonitorUp className="size-4" />}
				title="Export inspector"
				trailing={<PanelRightClose className="size-4 text-stone-500" />}
			/>
			<div className="flex h-[calc(100%-42px)] flex-col gap-3 overflow-y-auto px-3 py-3">
				<div className="rounded border border-[#3a3021] bg-[#1b1710] p-3">
					<div className="mb-3 flex items-center justify-between">
						<div>
							<div className="text-sm font-semibold text-stone-100">
								Export review
							</div>
							<div className="text-[11px] text-stone-500">
								Start-time snapshot
							</div>
						</div>
						<Badge
							className="border-amber-400/30 bg-amber-300/10 text-amber-200"
							variant="outline"
						>
							Ready
						</Badge>
					</div>
					<div className="space-y-2">
						<InspectorLine
							label="Output"
							value={prototypeState.export.output}
						/>
						<InspectorLine
							label="Strategy"
							value={prototypeState.export.strategy}
						/>
						<InspectorLine
							label="Precision"
							value={prototypeState.export.precision}
						/>
						<InspectorLine label="Runtime" value={prototypeState.runtime} />
					</div>
				</div>

				<div className="rounded border border-[#29251f] bg-[#15130f] p-3">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<Gauge className="size-4 text-emerald-300" />
						Capability
					</div>
					<div className="space-y-3 text-[11px] text-stone-400">
						<CapabilityRow label="Default profile" status="Supported" />
						<CapabilityRow label="Selected range" status="Best effort" />
						<CapabilityRow label="Cancellation" status="Available" />
					</div>
				</div>

				<div className="rounded border border-[#29251f] bg-[#15130f] p-3">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<BadgeCheck className="size-4 text-cyan-300" />
						Generated media
					</div>
					<div className="mb-3 text-[11px] text-stone-400">
						No generated media yet. Export and delivery stay separate.
					</div>
					<Button
						className="h-9 w-full bg-emerald-400 text-black hover:bg-emerald-300"
						type="button"
					>
						<Download className="size-4" />
						Start default export
					</Button>
				</div>

				<div className="mt-auto rounded border border-[#29251f] bg-[#11100d] p-3 font-mono text-[10px] leading-5 text-stone-500">
					<div>selection.startUs = 2_440_000</div>
					<div>selection.endUs = 9_860_000</div>
					<div>export.status = reviewing</div>
				</div>
			</div>
		</aside>
	);
}

function ViewerPanel({ chrome }: { chrome: "classic" | "cinema" | "console" }) {
	return (
		<section className="flex h-full min-h-0 flex-col bg-[#080807]">
			<div
				className={cn(
					"flex items-center justify-between border-b border-[#2b2721] px-3 text-[11px] text-stone-400",
					chrome === "cinema" ? "h-9" : "h-8",
				)}
			>
				<div className="flex items-center gap-2">
					<CircleDot className="size-3 text-red-400" />
					<span>Program viewer</span>
					<span className="font-mono text-stone-600">1x</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="font-mono">{prototypeState.playhead}</span>
					<Maximize2 className="size-3.5" />
				</div>
			</div>
			<div className="grid min-h-0 flex-1 place-items-center p-4">
				<div
					className={cn(
						"relative aspect-video w-full overflow-hidden border border-[#343029] bg-black shadow-2xl",
						chrome === "cinema" ? "max-w-6xl" : "max-w-5xl",
					)}
				>
					<img
						alt="Prototype media preview"
						className="h-full w-full object-cover"
						src={frameImage}
					/>
					<div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 text-[11px] text-stone-200">
						<span className="rounded bg-black/50 px-2 py-1 font-mono">
							3840 x 2160
						</span>
						<span className="rounded bg-black/50 px-2 py-1 font-mono">
							60 FPS
						</span>
					</div>
					<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4">
						<div className="mx-auto w-fit rounded bg-black/60 px-3 py-1 text-center text-sm font-medium text-stone-100">
							Selection preview frame
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function TransportStrip({ mode }: { mode: "classic" | "cinema" | "console" }) {
	return (
		<div
			className={cn(
				"grid grid-cols-[1fr_auto_1fr] items-center border-y border-[#2b2721] bg-[#11100e] px-3",
				mode === "cinema" ? "border-t-0" : null,
			)}
		>
			<div className="flex items-center gap-2 text-[11px] text-stone-400">
				<span className="font-mono">{prototypeState.playhead}</span>
				<span>/</span>
				<span className="font-mono">{prototypeState.asset.duration}</span>
			</div>
			<div className="flex items-center gap-1">
				<IconButton icon={<SkipBack className="size-4" />} label="Step back" />
				<IconButton
					icon={<Play className="size-4 fill-current" />}
					label="Play"
					primary
				/>
				<IconButton icon={<Pause className="size-4" />} label="Pause" />
				<IconButton
					icon={<SkipForward className="size-4" />}
					label="Step forward"
				/>
			</div>
			<div className="flex items-center justify-end gap-3 text-[11px] text-stone-400">
				<span className="font-mono">
					Selection {prototypeState.selection.duration}
				</span>
				<span className="flex items-center gap-1">
					<Volume2 className="size-3.5" />
					78%
				</span>
				<span className="flex items-center gap-1">
					<TimerReset className="size-3.5" />
					1.0x
				</span>
			</div>
		</div>
	);
}

function TimelinePanel({
	mode,
}: {
	mode: "resolved" | "classic" | "cinema" | "console";
}) {
	return (
		<section
			className={cn(
				"grid min-h-0 grid-rows-[38px_minmax(0,1fr)] border-t border-[#2b2721] bg-[#0d0d0b]",
				mode === "console"
					? "grid-cols-[300px_minmax(0,1fr)] grid-rows-none"
					: null,
			)}
		>
			{mode === "console" ? (
				<div className="border-r border-[#2b2721] bg-[#0f0e0c]">
					<PanelHeader
						icon={<AudioWaveform className="size-4" />}
						title="Selection surface"
					/>
					<div className="space-y-2 p-3 text-[11px] text-stone-400">
						<TrackHeader label="V1" meta="Preview reference" />
						<TrackHeader label="A1" meta="Voice lane" />
						<TrackHeader label="A2" meta="Desktop lane" />
					</div>
				</div>
			) : (
				<div className="flex items-center justify-between border-b border-[#2b2721] px-3">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<AudioWaveform className="size-4 text-emerald-300" />
						Selection and waveform
					</div>
					<div className="flex items-center gap-2">
						<Button
							className="h-7 border-[#3b352d] bg-[#171511] px-2 text-xs"
							size="sm"
							type="button"
							variant="outline"
						>
							<RotateCcw className="size-3.5" />
							Reset
						</Button>
						<Button
							className="h-7 border-[#3b352d] bg-[#171511] px-2 text-xs"
							size="sm"
							type="button"
							variant="outline"
						>
							Zoom 140%
						</Button>
					</div>
				</div>
			)}
			<div
				className={cn(
					"min-w-0 overflow-hidden p-4",
					mode === "console" ? "p-3" : null,
				)}
			>
				<div className="relative h-full min-h-[220px] overflow-hidden rounded border border-[#2b2721] bg-[#12110e]">
					<Ruler />
					<SelectionBand />
					<div className="absolute inset-x-5 top-16 space-y-5">
						{waveformLanes.map((lane) => (
							<WaveformLane key={lane.label} lane={lane} />
						))}
					</div>
					<div className="absolute bottom-3 left-5 right-5 flex items-center justify-between text-[11px] text-stone-500">
						<span>Click a lane to seek. Drag handles to commit selection.</span>
						<span className="font-mono">
							coverage {prototypeState.selection.coverage}
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}

function Ruler() {
	const marks = useMemo(
		() => [
			"00:00",
			"00:02",
			"00:04",
			"00:06",
			"00:08",
			"00:10",
			"00:12",
			"00:13.5",
		],
		[],
	);

	return (
		<div className="absolute inset-x-5 top-3 flex justify-between border-b border-[#302b23] pb-2 font-mono text-[10px] text-stone-500">
			{marks.map((mark) => (
				<div className="relative" key={mark}>
					<span>{mark}</span>
					<span className="absolute left-1/2 top-6 h-[148px] w-px bg-[#24211c]" />
				</div>
			))}
		</div>
	);
}

function SelectionBand() {
	return (
		<div className="absolute left-[24%] right-[27%] top-10 bottom-9 border-x-2 border-amber-300/90 bg-amber-300/10 shadow-[0_0_30px_rgba(252,211,77,0.08)]">
			<div className="absolute -left-2 top-0 h-full w-3 cursor-ew-resize bg-amber-300" />
			<div className="absolute -right-2 top-0 h-full w-3 cursor-ew-resize bg-amber-300" />
			<div className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-amber-300 px-2 py-1 font-mono text-[10px] text-black">
				{prototypeState.selection.duration}
			</div>
			<div className="absolute left-[38%] top-0 h-full w-px bg-red-400">
				<div className="-translate-x-1/2 rounded-b bg-red-400 px-1.5 py-0.5 font-mono text-[10px] text-black">
					{prototypeState.playhead}
				</div>
			</div>
		</div>
	);
}

function WaveformLane({
	lane,
}: {
	lane: {
		accent: string;
		label: string;
		meta: string;
		opacity: string;
		samples: number[];
	};
}) {
	return (
		<div className="grid h-16 grid-cols-[168px_minmax(0,1fr)] overflow-hidden rounded border border-[#26352f] bg-[#0b1713]">
			<div className="flex min-w-0 flex-col justify-center border-r border-[#1f3b31] bg-[#0d1713] px-3">
				<div className="flex min-w-0 items-center gap-2">
					<AudioLines className="size-3.5 shrink-0 text-emerald-300" />
					<span className="truncate text-xs font-semibold text-stone-100">
						{lane.label}
					</span>
				</div>
				<div className="truncate pl-5 font-mono text-[10px] text-stone-500">
					{lane.meta}
				</div>
			</div>
			<div className="flex min-w-0 items-center gap-1 overflow-hidden px-2">
				{lane.samples.map((height, index) => (
					<span
						className={cn(
							"w-full min-w-1 rounded-full",
							lane.accent,
							lane.opacity,
						)}
						key={`${lane.label}-${index}`}
						style={{ height: `${height}px` }}
					/>
				))}
			</div>
		</div>
	);
}

function IconRail() {
	const items = [
		{ icon: <FileVideo className="size-4" />, label: "Asset" },
		{ icon: <AudioWaveform className="size-4" />, label: "Selection" },
		{ icon: <MonitorUp className="size-4" />, label: "Export" },
		{ icon: <Settings2 className="size-4" />, label: "Runtime" },
	];

	return (
		<nav className="flex flex-col items-center gap-2 border-r border-[#2b2721] bg-[#0b0b0a] py-3">
			{items.map((item, index) => (
				<button
					className={cn(
						"flex size-10 items-center justify-center rounded border text-stone-500",
						index === 0
							? "border-amber-300/35 bg-amber-300/10 text-amber-200"
							: "border-[#28241f] bg-[#12110f]",
					)}
					key={item.label}
					title={item.label}
					type="button"
				>
					{item.icon}
				</button>
			))}
		</nav>
	);
}

function PrototypeSwitcher({
	current,
	onNext,
	onPrevious,
}: {
	current: PrototypeVariant;
	onNext: () => void;
	onPrevious: () => void;
}) {
	if (import.meta.env.PROD) {
		return null;
	}

	return (
		<div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/15 bg-black/80 px-3 py-2 text-sm text-white shadow-2xl backdrop-blur">
			<button
				aria-label="Previous prototype variant"
				className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
				onClick={onPrevious}
				type="button"
			>
				<ArrowLeft className="size-4" />
			</button>
			<div className="min-w-64 text-center font-medium">
				{current.key} - {current.name}
			</div>
			<button
				aria-label="Next prototype variant"
				className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
				onClick={onNext}
				type="button"
			>
				<ArrowRight className="size-4" />
			</button>
		</div>
	);
}

function PrototypeStateOverlay({ variant }: { variant: PrototypeVariant }) {
	return (
		<div className="pointer-events-none fixed right-4 bottom-4 z-40 w-56 rounded border border-white/10 bg-black/55 p-2 font-mono text-[10px] leading-4 text-stone-300 backdrop-blur">
			<div className="mb-1 flex items-center gap-1 font-sans text-[11px] font-semibold text-amber-200">
				<Sparkles className="size-3" />
				Prototype state
			</div>
			<div>variant: {variant.key}</div>
			<div>asset: ready</div>
			<div>
				selection: {prototypeState.selection.start} -{" "}
				{prototypeState.selection.end}
			</div>
			<div>export: reviewing</div>
		</div>
	);
}

function PanelHeader({
	icon,
	title,
	trailing,
}: {
	icon: ReactNode;
	title: string;
	trailing?: ReactNode;
}) {
	return (
		<div className="flex h-[42px] items-center justify-between border-b border-[#2b2721] px-3">
			<div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
				<span className="text-amber-300">{icon}</span>
				{title}
			</div>
			{trailing}
		</div>
	);
}

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
			{children}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-stone-600">{label}</div>
			<div className="truncate font-mono text-stone-200">{value}</div>
		</div>
	);
}

function TrackRow({
	icon,
	label,
	meta,
	status,
}: {
	icon: ReactNode;
	label: string;
	meta: string;
	status: string;
}) {
	return (
		<div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded border border-[#29251f] bg-[#15130f] px-2 py-2">
			<div className="text-stone-400">{icon}</div>
			<div className="min-w-0">
				<div className="truncate text-xs font-medium text-stone-200">
					{label}
				</div>
				<div className="truncate text-[10px] text-stone-500">{meta}</div>
			</div>
			<Badge
				className="border-[#294337] bg-[#0d2117] text-[10px] text-emerald-200"
				variant="outline"
			>
				{status}
			</Badge>
		</div>
	);
}

function TimeBox({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded border border-[#29251f] bg-[#15130f] p-2">
			<div className="text-[10px] uppercase tracking-[0.12em] text-stone-600">
				{label}
			</div>
			<div className="font-mono text-xs text-stone-100">{value}</div>
		</div>
	);
}

function InspectorLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-start justify-between gap-3 text-[11px]">
			<span className="text-stone-500">{label}</span>
			<span className="text-right font-medium text-stone-200">{value}</span>
		</div>
	);
}

function CapabilityRow({ label, status }: { label: string; status: string }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span>{label}</span>
			<span className="rounded bg-[#202017] px-2 py-0.5 font-medium text-amber-100">
				{status}
			</span>
		</div>
	);
}

function TrackHeader({ label, meta }: { label: string; meta: string }) {
	return (
		<div className="flex items-center justify-between rounded border border-[#29251f] bg-[#15130f] px-2 py-2">
			<span className="font-mono text-xs text-stone-200">{label}</span>
			<span className="text-[10px] text-stone-500">{meta}</span>
		</div>
	);
}

function IconButton({
	icon,
	label,
	primary = false,
}: {
	icon: ReactNode;
	label: string;
	primary?: boolean;
}) {
	return (
		<button
			aria-label={label}
			className={cn(
				"flex size-8 items-center justify-center rounded border border-[#343029] bg-[#171511] text-stone-300 hover:bg-[#232018]",
				primary
					? "border-emerald-300/40 bg-emerald-300 text-black hover:bg-emerald-200"
					: null,
			)}
			title={label}
			type="button"
		>
			{icon}
		</button>
	);
}

function readVariantFromUrl(): PrototypeVariantKey {
	if (typeof window === "undefined") {
		return "A";
	}

	const requestedVariant = new URLSearchParams(window.location.search).get(
		"variant",
	);

	if (
		requestedVariant === "R" ||
		requestedVariant === "A" ||
		requestedVariant === "B" ||
		requestedVariant === "C"
	) {
		return requestedVariant;
	}

	return "R";
}
