import {
	BadgeInfo,
	Cpu,
	Film,
	Gauge,
	Monitor,
	Settings,
	Sparkles,
	Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import type { ReadyMediaAsset } from "@/editor-core/model";
import { cn } from "@/lib/utils";

type ExportQualitySettingsMockProps = {
	asset: ReadyMediaAsset;
};

type QualitySettings = {
	aiModel: string;
	bitrate: number;
	bitrateInput: string;
	codec: string;
	frameInterpolationModel: string;
	resolution: string;
	targetFps: number;
	useAIUpscaling: boolean;
	useFrameInterpolation: boolean;
	useGpuAcceleration: boolean;
};

type StandardResolution = {
	height: number;
	label: string;
	value: string;
	width: number;
};

type ModelOption = {
	description: string;
	label: string;
	value: string;
};

type FrameInterpolationModel = ModelOption & {
	gpuRequired: boolean;
	maxFps: number;
};

type CodecInfo = {
	container: string;
	description: string;
	experimental?: boolean;
	gpu: {
		amd: string | null;
		apple: string | null;
		nvidia: string | null;
	};
	label: string;
};

const STANDARD_RESOLUTIONS = [
	{ height: 0, label: "Original", value: "original", width: 0 },
	{ height: 2160, label: "4K", value: "4k", width: 3840 },
	{ height: 1440, label: "1440p", value: "1440p", width: 2560 },
	{ height: 1080, label: "1080p", value: "1080p", width: 1920 },
	{ height: 720, label: "720p", value: "720p", width: 1280 },
	{ height: 480, label: "480p", value: "480p", width: 854 },
	{ height: 360, label: "360p", value: "360p", width: 640 },
] satisfies StandardResolution[];

const AI_UPSCALING_MODELS = [
	{
		description: "Best for photos and realistic source frames",
		label: "ESRGAN",
		value: "esrgan",
	},
	{
		description: "Improved real-world image recovery",
		label: "Real-ESRGAN",
		value: "real_esrgan",
	},
	{
		description: "Fast 2x enhancement pass",
		label: "EDSR",
		value: "edsr",
	},
	{
		description: "Lightweight super-resolution model",
		label: "SRCNN",
		value: "srcnn",
	},
	{
		description: "Specialized for anime and artwork",
		label: "WAIFU2X",
		value: "waifu2x",
	},
	{
		description: "Transformer-based high detail recovery",
		label: "SwinIR",
		value: "swinir",
	},
] satisfies ModelOption[];

const FRAME_INTERPOLATION_MODELS = [
	{
		description: "Balanced speed and quality",
		gpuRequired: true,
		label: "RIFE",
		maxFps: 120,
		value: "rife",
	},
	{
		description: "Optimized for CPU and mobile inference",
		gpuRequired: false,
		label: "RIFE-NCNN",
		maxFps: 60,
		value: "rife_ncnn",
	},
	{
		description: "Depth-aware interpolation for high quality motion",
		gpuRequired: false,
		label: "DAIN-NCNN",
		maxFps: 60,
		value: "dain_ncnn",
	},
	{
		description: "Fast flow-agnostic interpolation",
		gpuRequired: true,
		label: "FLAVR",
		maxFps: 120,
		value: "flavr",
	},
	{
		description: "Quality-biased extreme interpolation",
		gpuRequired: true,
		label: "XVFI",
		maxFps: 60,
		value: "xvfi",
	},
] satisfies FrameInterpolationModel[];

const CODECS: Record<string, CodecInfo> = {
	av1: {
		container: "MP4",
		description: "Next-gen compression, experimental",
		experimental: true,
		gpu: { amd: "av1_amf", apple: null, nvidia: "av1_nvenc" },
		label: "AV1",
	},
	h264_mov: {
		container: "MOV",
		description: "Compatible H.264 in MOV container",
		gpu: { amd: "h264_amf", apple: "h264_videotoolbox", nvidia: "h264_nvenc" },
		label: "H.264",
	},
	h264_mp4: {
		container: "MP4",
		description: "Most compatible, widely supported",
		gpu: { amd: "h264_amf", apple: "h264_videotoolbox", nvidia: "h264_nvenc" },
		label: "H.264",
	},
	h265_mov: {
		container: "MOV",
		description: "High efficiency in MOV container",
		gpu: { amd: "h265_amf", apple: "h265_videotoolbox", nvidia: "h265_nvenc" },
		label: "H.265",
	},
	h265_mp4: {
		container: "MP4",
		description: "Better compression, smaller files",
		gpu: { amd: "h265_amf", apple: "h265_videotoolbox", nvidia: "h265_nvenc" },
		label: "H.265",
	},
	prores_mov: {
		container: "MOV",
		description: "Professional editing codec",
		gpu: { amd: null, apple: "prores_videotoolbox", nvidia: null },
		label: "ProRes",
	},
	vp8_webm: {
		container: "WebM",
		description: "Older WebM codec, broad fallback support",
		gpu: { amd: null, apple: null, nvidia: null },
		label: "VP8",
	},
	vp9_webm: {
		container: "WebM",
		description: "Modern WebM compression",
		gpu: { amd: null, apple: null, nvidia: "vp9_nvenc" },
		label: "VP9",
	},
};

const CODEC_GROUPS = [
	{
		codecs: ["h264_mp4", "h265_mp4"],
		label: "MP4",
	},
	{
		codecs: ["vp8_webm", "vp9_webm"],
		label: "WebM",
	},
	{
		codecs: ["h264_mov", "h265_mov", "prores_mov"],
		label: "MOV",
	},
	{
		codecs: ["av1"],
		label: "Experimental",
	},
] satisfies Array<{ codecs: string[]; label: string }>;

const DEFAULT_QUALITY_SETTINGS: QualitySettings = {
	aiModel: "esrgan",
	bitrate: 10,
	bitrateInput: "10",
	codec: "h264_mp4",
	frameInterpolationModel: "rife",
	resolution: "original",
	targetFps: 60,
	useAIUpscaling: false,
	useFrameInterpolation: false,
	useGpuAcceleration: false,
};

const HARDWARE_SUPPORT = {
	amd: false,
	apple: true,
	nvidia: false,
};

const GPU_VENDOR_LABELS = {
	amd: "VCE",
	apple: "VideoToolbox",
	nvidia: "NVENC",
};

export function ExportQualitySettingsMock({
	asset,
}: ExportQualitySettingsMockProps) {
	const [open, setOpen] = useState(false);
	const [settings, setSettings] = useState(DEFAULT_QUALITY_SETTINGS);
	const sourceMetadata = useMemo(() => mediaMetadataForAsset(asset), [asset]);
	const selectedCodec = CODECS[settings.codec];
	const selectedResolution = formatResolutionChoice(settings, sourceMetadata);
	const gpuAcceleration = getAvailableGpuAcceleration(settings.codec);

	return (
		<section
			aria-label="Quality settings panel"
			className="rounded border border-workbench-border bg-workbench-lane p-2.5"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
						<Settings
							aria-hidden="true"
							className="size-4 text-workbench-progress"
						/>
						<span className="min-w-0 truncate">Quality settings</span>
					</div>
					<p className="mt-1 text-[11px] leading-5 text-muted-foreground">
						Choose output profile presets before exporting.
					</p>
				</div>
				<Badge className="shrink-0" variant="outline">
					Preview
				</Badge>
			</div>
			<div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
				<QualitySummaryFact label="Resolution" value={selectedResolution} />
				<QualitySummaryFact
					label="Bitrate"
					value={`${settings.bitrate} Mbps`}
				/>
				<QualitySummaryFact
					label="Codec"
					value={`${selectedCodec.label} / ${selectedCodec.container}`}
				/>
				<QualitySummaryFact
					label="AI tools"
					value={
						settings.useAIUpscaling || settings.useFrameInterpolation
							? "Enabled"
							: "Off"
					}
				/>
			</div>
			<Button
				className="mt-2 h-8 w-full"
				onClick={() => setOpen(true)}
				size="sm"
				type="button"
				variant="outline"
			>
				<Settings data-icon="inline-start" />
				Quality choices
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="quality-settings-dialog max-h-[min(46rem,calc(100dvh-2rem))] overflow-hidden border-workbench-border-strong bg-workbench-inspector p-0 text-workbench-foreground shadow-2xl shadow-black/80 sm:max-w-[44rem]">
					<DialogHeader className="border-b border-workbench-border px-4 py-4">
						<DialogTitle className="flex min-w-0 items-center gap-2 text-base">
							<Settings aria-hidden="true" className="size-4" />
							<span className="min-w-0 truncate">Export Quality Settings</span>
						</DialogTitle>
						<DialogDescription>
							Resolution, bitrate, codec, acceleration, and interpolation
							choices for the selected export.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="h-[min(31rem,calc(100dvh-14rem))]">
						<div className="flex flex-col gap-5 px-4 py-4">
							<ResolutionSection
								settings={settings}
								sourceMetadata={sourceMetadata}
								onChange={setSettings}
							/>
							<Separator />
							<BitrateSection
								settings={settings}
								sourceMetadata={sourceMetadata}
								onChange={setSettings}
							/>
							<Separator />
							<CodecSection settings={settings} onChange={setSettings} />
							<GpuSection
								acceleration={gpuAcceleration}
								settings={settings}
								onChange={setSettings}
							/>
							<Separator />
							<FrameInterpolationSection
								settings={settings}
								sourceMetadata={sourceMetadata}
								onChange={setSettings}
							/>
						</div>
					</ScrollArea>
					<DialogFooter className="border-t border-workbench-border px-4 py-3">
						<Button
							className="border-workbench-border-strong text-workbench-lane-foreground hover:bg-workbench-hover"
							onClick={() => setSettings(DEFAULT_QUALITY_SETTINGS)}
							type="button"
							variant="outline"
						>
							Reset
						</Button>
						<Button
							className="bg-workbench-selected text-workbench-selected-foreground hover:bg-workbench-selected/90"
							onClick={() => setOpen(false)}
							type="button"
						>
							Apply choices
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}

function QualitySummaryFact({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="min-w-0 rounded border border-workbench-border bg-workbench-hover/35 px-2 py-1.5">
			<div className="truncate text-muted-foreground">{label}</div>
			<div className="truncate font-medium text-foreground">{value}</div>
		</div>
	);
}

function ResolutionSection({
	onChange,
	settings,
	sourceMetadata,
}: {
	onChange: (settings: QualitySettings) => void;
	settings: QualitySettings;
	sourceMetadata: SourceMediaMetadata;
}) {
	const categorized = categorizeResolutions(sourceMetadata);

	return (
		<QualityDialogSection
			description={
				sourceMetadata.width && sourceMetadata.height
					? `Source: ${sourceMetadata.width}x${sourceMetadata.height}`
					: "Source resolution unavailable"
			}
			icon={<Monitor aria-hidden="true" className="size-4" />}
			title="Resolution"
		>
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{categorized.map((resolution) => (
						<ChoiceCard
							active={
								settings.resolution === resolution.value &&
								!settings.useAIUpscaling
							}
							key={resolution.value}
							onClick={() =>
								onChange({
									...settings,
									resolution: resolution.value,
									useAIUpscaling: false,
								})
							}
							title={resolution.label}
							value={
								resolution.value === "original"
									? "Keep source"
									: `${resolution.width}x${resolution.height}`
							}
						/>
					))}
				</div>
				<div className="flex items-center gap-2 rounded border border-workbench-border bg-workbench-hover/25 p-2">
					<Checkbox
						checked={settings.useAIUpscaling}
						id="mock-ai-upscaling"
						onCheckedChange={(checked) =>
							onChange({
								...settings,
								useAIUpscaling: checked === true,
							})
						}
					/>
					<label
						className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"
						htmlFor="mock-ai-upscaling"
					>
						<Sparkles aria-hidden="true" className="size-4" />
						<span className="min-w-0 truncate">AI Upscaling</span>
					</label>
					<Badge variant="outline">AI</Badge>
				</div>
				{settings.useAIUpscaling ? (
					<ModelSelect
						label="AI model"
						options={AI_UPSCALING_MODELS}
						value={settings.aiModel}
						onValueChange={(aiModel) => onChange({ ...settings, aiModel })}
					/>
				) : null}
			</div>
		</QualityDialogSection>
	);
}

function BitrateSection({
	onChange,
	settings,
	sourceMetadata,
}: {
	onChange: (settings: QualitySettings) => void;
	settings: QualitySettings;
	sourceMetadata: SourceMediaMetadata;
}) {
	return (
		<QualityDialogSection
			description={
				sourceMetadata.bitrateMbps
					? `Estimated source bitrate: ${sourceMetadata.bitrateMbps} Mbps`
					: "Set a target video bitrate"
			}
			icon={<Gauge aria-hidden="true" className="size-4" />}
			title="Bitrate"
		>
			<div className="flex flex-col gap-3">
				<div className="px-2">
					<Slider
						aria-label="Mock bitrate"
						max={100}
						min={1}
						onValueChange={(value) => {
							const bitrate = value[0] ?? settings.bitrate;
							onChange({
								...settings,
								bitrate,
								bitrateInput: String(bitrate),
							});
						}}
						step={1}
						value={[settings.bitrate]}
					/>
					<div className="mt-1 flex justify-between text-xs text-muted-foreground">
						<span>1 Mbps</span>
						<span>100 Mbps</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Input
						aria-label="Mock bitrate input"
						className="h-8 w-24"
						inputMode="numeric"
						max={100}
						min={1}
						onChange={(event) => {
							const bitrateInput = event.target.value;
							const parsed = Number.parseInt(bitrateInput, 10);
							onChange({
								...settings,
								bitrate:
									Number.isNaN(parsed) || parsed < 1 || parsed > 100
										? settings.bitrate
										: parsed,
								bitrateInput,
							});
						}}
						type="number"
						value={settings.bitrateInput}
					/>
					<span className="text-sm text-muted-foreground">Mbps</span>
				</div>
			</div>
		</QualityDialogSection>
	);
}

function CodecSection({
	onChange,
	settings,
}: {
	onChange: (settings: QualitySettings) => void;
	settings: QualitySettings;
}) {
	return (
		<QualityDialogSection
			description="Pick an output codec and container profile."
			icon={<Film aria-hidden="true" className="size-4" />}
			title="Codec & Container"
		>
			<div className="flex flex-col gap-4">
				{CODEC_GROUPS.map((group) => (
					<div className="flex flex-col gap-2" key={group.label}>
						<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
							<span className="size-2 rounded-full bg-workbench-progress" />
							<span>{group.label}</span>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{group.codecs.map((codecKey) => {
								const codec = CODECS[codecKey];
								return (
									<ChoiceCard
										active={settings.codec === codecKey}
										badge={codec.experimental ? "Experimental" : undefined}
										key={codecKey}
										onClick={() =>
											onChange({
												...settings,
												codec: codecKey,
												useGpuAcceleration:
													settings.useGpuAcceleration &&
													getAvailableGpuAcceleration(codecKey) !== null,
											})
										}
										title={`${codec.label} / ${codec.container}`}
										value={codec.description}
									/>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</QualityDialogSection>
	);
}

function GpuSection({
	acceleration,
	onChange,
	settings,
}: {
	acceleration: GpuAcceleration | null;
	onChange: (settings: QualitySettings) => void;
	settings: QualitySettings;
}) {
	return (
		<div className="flex items-center gap-2 rounded border border-workbench-border bg-workbench-hover/25 p-2">
			<Checkbox
				checked={settings.useGpuAcceleration}
				disabled={!acceleration}
				id="mock-gpu-acceleration"
				onCheckedChange={(checked) =>
					onChange({
						...settings,
						useGpuAcceleration: checked === true,
					})
				}
			/>
			<label
				className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"
				htmlFor="mock-gpu-acceleration"
			>
				<Cpu aria-hidden="true" className="size-4" />
				<span className="min-w-0 truncate">GPU Acceleration</span>
			</label>
			<Badge variant={acceleration ? "outline" : "secondary"}>
				{acceleration ? GPU_VENDOR_LABELS[acceleration.vendor] : "Unavailable"}
			</Badge>
		</div>
	);
}

function FrameInterpolationSection({
	onChange,
	settings,
	sourceMetadata,
}: {
	onChange: (settings: QualitySettings) => void;
	settings: QualitySettings;
	sourceMetadata: SourceMediaMetadata;
}) {
	const selectedModel = FRAME_INTERPOLATION_MODELS.find(
		(model) => model.value === settings.frameInterpolationModel,
	);
	const sourceFps = sourceMetadata.fps ?? 30;
	const maxFps = selectedModel?.maxFps ?? 120;

	return (
		<QualityDialogSection
			description={
				sourceMetadata.fps
					? `Source: ${sourceMetadata.fps} fps`
					: "Create intermediate frames for a smoother output."
			}
			icon={<Zap aria-hidden="true" className="size-4" />}
			title="Frame Interpolation"
		>
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 rounded border border-workbench-border bg-workbench-hover/25 p-2">
					<Checkbox
						checked={settings.useFrameInterpolation}
						id="mock-frame-interpolation"
						onCheckedChange={(checked) =>
							onChange({
								...settings,
								useFrameInterpolation: checked === true,
							})
						}
					/>
					<label
						className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"
						htmlFor="mock-frame-interpolation"
					>
						<Sparkles aria-hidden="true" className="size-4" />
						<span className="min-w-0 truncate">Enable frame interpolation</span>
					</label>
					<Badge variant="outline">AI</Badge>
				</div>
				{settings.useFrameInterpolation ? (
					<>
						<ModelSelect
							label="Interpolation model"
							options={FRAME_INTERPOLATION_MODELS}
							value={settings.frameInterpolationModel}
							onValueChange={(frameInterpolationModel) => {
								const model = FRAME_INTERPOLATION_MODELS.find(
									(option) => option.value === frameInterpolationModel,
								);
								onChange({
									...settings,
									frameInterpolationModel,
									targetFps: Math.min(
										settings.targetFps,
										model?.maxFps ?? settings.targetFps,
									),
								});
							}}
						/>
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium" htmlFor="mock-target-fps">
								Target Frame Rate
							</label>
							<div className="px-2">
								<Slider
									aria-label="Mock target frame rate"
									id="mock-target-fps"
									max={maxFps}
									min={sourceFps}
									onValueChange={(value) =>
										onChange({
											...settings,
											targetFps: value[0] ?? settings.targetFps,
										})
									}
									step={10}
									value={[settings.targetFps]}
								/>
								<div className="mt-1 flex justify-between text-xs text-muted-foreground">
									<span>{sourceFps} fps</span>
									<span>{settings.targetFps} fps</span>
									<span>{maxFps} fps</span>
								</div>
							</div>
							{selectedModel?.gpuRequired && !settings.useGpuAcceleration ? (
								<p className="flex items-center gap-2 text-xs text-muted-foreground">
									<BadgeInfo aria-hidden="true" className="size-3.5" />
									This model is GPU-biased in the original modal.
								</p>
							) : null}
						</div>
					</>
				) : null}
			</div>
		</QualityDialogSection>
	);
}

function QualityDialogSection({
	children,
	description,
	icon,
	title,
}: {
	children: ReactNode;
	description: string;
	icon: ReactNode;
	title: string;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-start gap-2">
				<div className="mt-0.5 text-workbench-progress">{icon}</div>
				<div className="min-w-0">
					<h3 className="text-sm font-semibold">{title}</h3>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{description}
					</p>
				</div>
			</div>
			{children}
		</section>
	);
}

function ModelSelect({
	label,
	onValueChange,
	options,
	value,
}: {
	label: string;
	onValueChange: (value: string) => void;
	options: readonly ModelOption[];
	value: string;
}) {
	const selected = options.find((option) => option.value === value);
	const selectId = `mock-${label.toLowerCase().replaceAll(" ", "-")}`;

	return (
		<div className="flex flex-col gap-2 rounded border border-workbench-border bg-workbench-hover/20 p-2.5">
			<label className="text-sm font-medium" htmlFor={selectId}>
				{label}
			</label>
			<Select onValueChange={onValueChange} value={value}>
				<SelectTrigger className="h-8 w-full" id={selectId} size="sm">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{options.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			{selected ? (
				<p className="text-xs leading-5 text-muted-foreground">
					{selected.description}
				</p>
			) : null}
		</div>
	);
}

function ChoiceCard({
	active,
	badge,
	onClick,
	title,
	value,
}: {
	active: boolean;
	badge?: string;
	onClick: () => void;
	title: string;
	value: string;
}) {
	return (
		<button
			aria-pressed={active}
			className={cn(
				"min-w-0 rounded-md border border-workbench-border bg-workbench-lane p-2.5 text-left transition-colors hover:bg-workbench-hover",
				active &&
					"border-workbench-selected bg-workbench-hover ring-1 ring-workbench-selected",
			)}
			onClick={onClick}
			type="button"
		>
			<div className="flex min-w-0 items-start justify-between gap-2">
				<span className="min-w-0 truncate text-sm font-medium">{title}</span>
				{active ? (
					<span className="mt-1 size-2 shrink-0 rounded-full bg-workbench-selected" />
				) : null}
			</div>
			<div className="mt-1 flex min-w-0 items-center gap-2">
				<p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{value}
				</p>
				{badge ? (
					<Badge className="shrink-0" variant="outline">
						{badge}
					</Badge>
				) : null}
			</div>
		</button>
	);
}

type SourceMediaMetadata = {
	bitrateMbps?: number;
	fps?: number;
	height?: number;
	width?: number;
};

type GpuAcceleration = {
	encoder: string;
	vendor: keyof typeof HARDWARE_SUPPORT;
};

function mediaMetadataForAsset(asset: ReadyMediaAsset): SourceMediaMetadata {
	const videoTrack = asset.tracks.video[0];
	const durationSeconds = asset.durationUs / 1_000_000;
	const bitrateMbps =
		durationSeconds > 0
			? Math.max(
					1,
					Math.round(
						(asset.provenance.sizeBytes * 8) / durationSeconds / 1_000_000,
					),
				)
			: undefined;

	return {
		bitrateMbps,
		fps: Math.round(asset.frameTiming.fps),
		height: videoTrack?.height,
		width: videoTrack?.width,
	};
}

function categorizeResolutions(
	sourceMetadata: SourceMediaMetadata,
): StandardResolution[] {
	if (!sourceMetadata.width || !sourceMetadata.height) {
		return STANDARD_RESOLUTIONS;
	}

	const sourceWidth = sourceMetadata.width;
	const sourceHeight = sourceMetadata.height;
	const original = STANDARD_RESOLUTIONS[0];
	const downscale = STANDARD_RESOLUTIONS.filter(
		(resolution) =>
			resolution.value !== "original" &&
			resolution.width < sourceWidth &&
			resolution.height < sourceHeight,
	);
	const upscale = STANDARD_RESOLUTIONS.filter(
		(resolution) =>
			resolution.value !== "original" &&
			resolution.width > sourceWidth &&
			resolution.height > sourceHeight,
	);

	return [original, ...downscale, ...upscale];
}

function formatResolutionChoice(
	settings: QualitySettings,
	sourceMetadata: SourceMediaMetadata,
): string {
	if (settings.useAIUpscaling) {
		const model = AI_UPSCALING_MODELS.find(
			(option) => option.value === settings.aiModel,
		);

		return model ? `AI ${model.label}` : "AI upscale";
	}

	if (settings.resolution === "original") {
		if (!sourceMetadata.width || !sourceMetadata.height) {
			return "Original";
		}

		return `${sourceMetadata.width}x${sourceMetadata.height}`;
	}

	const resolution = STANDARD_RESOLUTIONS.find(
		(option) => option.value === settings.resolution,
	);

	return resolution?.label ?? settings.resolution;
}

function getAvailableGpuAcceleration(
	codecValue: string,
): GpuAcceleration | null {
	const codecInfo = CODECS[codecValue];

	if (!codecInfo) {
		return null;
	}

	for (const vendor of Object.keys(HARDWARE_SUPPORT) as Array<
		keyof typeof HARDWARE_SUPPORT
	>) {
		const encoder = codecInfo.gpu[vendor];

		if (HARDWARE_SUPPORT[vendor] && encoder) {
			return { encoder, vendor };
		}
	}

	return null;
}
