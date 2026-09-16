import {
	Captions,
	Film,
	Monitor,
	Music2,
	Settings,
	Sparkles,
	Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	type AudioMix,
	DEFAULT_OUTPUT_PROFILE,
	type OutputQualitySetting,
	type OutputSettings,
	type ReadyMediaAsset,
} from "@/editor-core/model";
import {
	OUTPUT_SUBJECTIVE_QUALITY_CHOICES,
	type ResolvedOutputAudioProfile,
	type ResolvedOutputQuality,
	type ResolvedOutputResolution,
	type ResolvedOutputVideoProfile,
	formatOutputQualitySetting,
	getOutputResolutionChoices,
	resolveOutputAudioProfile,
	resolveOutputQuality,
	resolveOutputResolution,
	resolveOutputVideoProfile,
} from "@/editor-core/output-settings";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../adapters/mediabunny-output-support";
import { ExportPresetControls } from "../presets/export-preset-controls";
import { saveLastUsedSettings } from "../presets/export-preset-store";

type OutputSettingsPanelProps = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	exportRunning: boolean;
	onApplyOutputSettings: (outputSettings: OutputSettings) => void;
	outputSettings: OutputSettings;
};

const BITS_PER_MEGABIT = 1_000_000;
const outputSettingsCategoryTabClassName =
	"relative h-11 flex-none justify-start rounded-none border-0 bg-transparent px-0 font-medium text-muted-foreground shadow-none hover:text-foreground disabled:opacity-40 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-workbench-focus focus-visible:ring-0";

// Keep this deferred AI roadmap in the modal until these controls are fully implemented.
const AI_UPSCALING_MODELS = [
	{
		description: "Best for photos and realistic source frames",
		label: "ESRGAN",
	},
	{
		description: "Improved real-world image recovery",
		label: "Real-ESRGAN",
	},
	{
		description: "Fast 2x enhancement pass",
		label: "EDSR",
	},
	{
		description: "Lightweight super-resolution model",
		label: "SRCNN",
	},
	{
		description: "Specialized for anime and artwork",
		label: "WAIFU2X",
	},
	{
		description: "Transformer-based high detail recovery",
		label: "SwinIR",
	},
] as const;

const FRAME_INTERPOLATION_MODELS = [
	{
		description: "Balanced speed and quality",
		label: "RIFE",
		maxFps: 120,
	},
	{
		description: "Optimized for CPU and mobile inference",
		label: "RIFE-NCNN",
		maxFps: 60,
	},
	{
		description: "Depth-aware interpolation for high quality motion",
		label: "DAIN-NCNN",
		maxFps: 60,
	},
	{
		description: "Fast flow-agnostic interpolation",
		label: "FLAVR",
		maxFps: 120,
	},
	{
		description: "Quality-biased extreme interpolation",
		label: "XVFI",
		maxFps: 60,
	},
] as const;

export function OutputSettingsPanel({
	asset,
	audioMix,
	exportRunning,
	onApplyOutputSettings,
	outputSettings,
}: OutputSettingsPanelProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<OutputSettings | null>(null);
	const openingSnapshotRef = useRef<OutputSettings | null>(null);
	const visibleDraft = draft ?? outputSettings;

	function openModal() {
		const snapshot = cloneOutputSettings(outputSettings);
		setDraft(snapshot);
		openingSnapshotRef.current = cloneOutputSettings(snapshot);
		setOpen(true);
	}

	function closeModal() {
		openingSnapshotRef.current = null;
		setDraft(null);
		setOpen(false);
	}

	function applyDraft() {
		if (exportRunning || !draftIsValid) {
			return;
		}

		const appliedOutputSettings = cloneOutputSettings(visibleDraft);
		onApplyOutputSettings(appliedOutputSettings);
		try {
			saveLastUsedSettings(window.localStorage, appliedOutputSettings);
		} catch {
			// Applying session-local settings must still succeed when storage is unavailable.
		}
		closeModal();
	}
	function changeContainer(containerId: string) {
		const nextDraft = cloneOutputSettings(activeDraft);
		nextDraft.container =
			containerId === "default-output-profile"
				? { kind: "default-output-profile" }
				: { container: containerId, kind: "documented-container" };

		if (nextDraft.videoCodec.kind === "default-output-profile") {
			nextDraft.videoCodec = { kind: "preserve-source" };
		}
		if (nextDraft.audioCodec.kind === "default-output-profile") {
			nextDraft.audioCodec = { kind: "preserve-source" };
		}

		setReconciledDraft(nextDraft);
	}

	function changeVideoCodec(codec: string) {
		const nextDraft = cloneOutputSettings(activeDraft);
		nextDraft.videoCodec =
			codec === "default-output-profile"
				? { kind: "default-output-profile" }
				: codec === "preserve-source"
					? { kind: "preserve-source" }
					: { codec, kind: "documented-codec" };

		setReconciledDraft(nextDraft);
	}

	function changeAudioCodec(codec: string) {
		const nextDraft = cloneOutputSettings(activeDraft);
		nextDraft.audioCodec =
			codec === "no-audio"
				? { kind: "no-audio" }
				: codec === "default-output-profile"
					? { kind: "default-output-profile" }
					: codec === "preserve-source"
						? { kind: "preserve-source" }
						: { codec, kind: "documented-codec" };

		setReconciledDraft(nextDraft);
	}

	function changeResolution(value: string) {
		const choice = resolutionChoices.find(
			({ setting }) => resolutionSettingValue(setting) === value,
		);
		if (!choice) {
			return;
		}

		const nextDraft = cloneOutputSettings(activeDraft);
		nextDraft.resolution = { ...choice.setting };
		setDraft(nextDraft);
	}

	function changeQuality(mediaKind: "audio" | "video", value: string) {
		const nextDraft = cloneOutputSettings(activeDraft);
		const currentSetting =
			mediaKind === "video"
				? activeDraft.videoQuality
				: activeDraft.audioQuality;
		let nextSetting: OutputQualitySetting;
		if (value === "preserve-source") {
			nextSetting = { kind: "preserve-source" };
		} else if (value === "custom-bitrate") {
			nextSetting = {
				bitrateBps:
					currentSetting.kind === "custom-bitrate"
						? currentSetting.bitrateBps
						: mediaKind === "video"
							? 5_000_000
							: 192_000,
				kind: "custom-bitrate",
			};
		} else {
			const quality = OUTPUT_SUBJECTIVE_QUALITY_CHOICES.find(
				(choice) => choice.value === value,
			)?.value;
			if (!quality) {
				return;
			}
			nextSetting = { kind: "subjective-quality", quality };
		}

		if (mediaKind === "video") {
			nextDraft.videoQuality = nextSetting;
		} else {
			nextDraft.audioQuality = nextSetting;
		}
		setDraft(nextDraft);
	}

	function changeCustomBitrate(
		mediaKind: "audio" | "video",
		bitrateBps: number,
	) {
		const nextDraft = cloneOutputSettings(activeDraft);
		const nextSetting: OutputQualitySetting = {
			bitrateBps,
			kind: "custom-bitrate",
		};
		if (mediaKind === "video") {
			nextDraft.videoQuality = nextSetting;
		} else {
			nextDraft.audioQuality = nextSetting;
		}
		setDraft(nextDraft);
	}

	function setReconciledDraft(nextDraft: OutputSettings) {
		const videoProfile = resolveOutputVideoProfile({
			asset,
			outputSettings: nextDraft,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});

		const audioProfile = resolveOutputAudioProfile({
			asset,
			audioMix,
			outputSettings: nextDraft,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});
		const replacementMessages: string[] = [];

		if (videoProfile.kind === "resolved" && videoProfile.automaticReplacement) {
			nextDraft.videoCodec = {
				codec: videoProfile.videoCodec,
				kind: "documented-codec",
			};
			replacementMessages.push(
				`${formatCodecName(videoProfile.automaticReplacement.requestedCodec)} cannot be preserved in ${videoProfile.container.label}. ${formatCodecName(videoProfile.videoCodec)} was selected automatically.`,
			);
		}
		if (audioProfile.kind === "resolved" && audioProfile.automaticReplacement) {
			nextDraft.audioCodec = {
				codec: audioProfile.automaticReplacement.audioCodec,
				kind: "documented-codec",
			};
			replacementMessages.push(
				`${formatCodecName(audioProfile.automaticReplacement.requestedCodec)} cannot be preserved in ${audioProfile.container.label}. ${formatCodecName(audioProfile.audioCodec)} was selected automatically.`,
			);
		}
		setAutomaticReplacementMessage(replacementMessages.join(" ") || null);

		setDraft(nextDraft);
	}
	const sourceDimensions = formatSourceDimensions(asset);
	const sourceVideoTrack = asset.tracks.video[0];
	const sourceResolution =
		sourceVideoTrack?.width && sourceVideoTrack.height
			? {
					height: sourceVideoTrack.height,
					width: sourceVideoTrack.width,
				}
			: undefined;
	const [automaticReplacementMessage, setAutomaticReplacementMessage] =
		useState<string | null>(null);
	const activeDraft = draft ?? outputSettings;
	const resolutionChoices = getOutputResolutionChoices(asset);
	const resolvedResolution = resolveOutputResolution({
		asset,
		setting: activeDraft.resolution,
	});
	const resolvedVideoQuality = resolveOutputQuality({
		mediaKind: "video",
		setting: activeDraft.videoQuality,
	});
	const resolvedAudioQuality = resolveOutputQuality({
		mediaKind: "audio",
		setting:
			activeDraft.audioCodec.kind === "no-audio"
				? { kind: "preserve-source" }
				: activeDraft.audioQuality,
	});
	const resolvedDraft = resolveOutputVideoProfile({
		asset,
		outputSettings: activeDraft,
		support: MEDIABUNNY_OUTPUT_SUPPORT,
	});
	const resolvedAudio = resolveOutputAudioProfile({
		asset,
		audioMix,
		outputSettings: activeDraft,
		support: MEDIABUNNY_OUTPUT_SUPPORT,
	});
	const selectedContainer =
		resolvedDraft.kind === "resolved"
			? resolvedDraft.container
			: containerForSetting(activeDraft.container);
	const compatibleVideoCodecs = selectedContainer?.videoCodecs ?? [];
	const compatibleAudioCodecs = selectedContainer?.audioCodecs ?? [];
	const draftIsValid =
		resolvedDraft.kind !== "invalid" &&
		resolvedAudio.kind !== "invalid" &&
		resolvedResolution.kind !== "invalid" &&
		resolvedVideoQuality.kind !== "invalid" &&
		resolvedAudioQuality.kind !== "invalid";

	function openResolvedOutputSettings() {
		setAutomaticReplacementMessage(null);
		openModal();
	}

	function applyResolvedDraft() {
		if (!draftIsValid) {
			return;
		}

		applyDraft();
	}

	return (
		<section aria-label="Output settings panel" className="min-w-0">
			<Button
				className="h-10 w-full justify-between"
				disabled={exportRunning}
				onClick={openResolvedOutputSettings}
				size="sm"
				type="button"
				variant="outline"
			>
				Output settings
				<Settings data-icon="inline-end" />
			</Button>
			{exportRunning ? (
				<p className="mt-2 text-xs text-muted-foreground">
					<span>Locked</span> while export is running.
				</p>
			) : null}
			<Dialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (nextOpen) {
						openModal();
						return;
					}

					closeModal();
				}}
			>
				<DialogContent className="quality-settings-dialog flex h-[min(36rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden border-workbench-border-strong bg-workbench-inspector p-0 text-workbench-foreground shadow-none sm:max-w-[48rem]">
					<DialogHeader className="shrink-0 text-left px-6 pt-6 pb-4">
						<DialogTitle className="min-w-0 text-xl font-medium tracking-tight">
							<span className="min-w-0 truncate">Output settings</span>
						</DialogTitle>
						<DialogDescription>
							Settings may affect quality, file size, and export time.
						</DialogDescription>
					</DialogHeader>
					<Tabs
						className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_15rem] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden"
						defaultValue="general"
						orientation="horizontal"
					>
						<div className="sticky top-0 z-10 shrink-0 bg-workbench-inspector px-6 pb-4 md:col-span-2">
							<TabsList
								aria-label="Output settings categories"
								className="flex h-auto w-fit max-w-full flex-wrap items-stretch justify-start gap-x-6 gap-y-1 rounded-none bg-transparent p-0"
							>
								<TabsTrigger
									className={outputSettingsCategoryTabClassName}
									value="general"
								>
									General
								</TabsTrigger>
								<TabsTrigger
									className={outputSettingsCategoryTabClassName}
									value="video"
								>
									Video
								</TabsTrigger>
								<TabsTrigger
									className={outputSettingsCategoryTabClassName}
									value="audio"
								>
									Audio
								</TabsTrigger>
								<TabsTrigger
									className={outputSettingsCategoryTabClassName}
									disabled
									value="ai"
								>
									AI
								</TabsTrigger>
								<TabsTrigger
									className={outputSettingsCategoryTabClassName}
									disabled
									value="subtitles"
								>
									Subtitles
								</TabsTrigger>
							</TabsList>
						</div>
						<div className="min-w-0 shrink-0 md:min-h-0 md:overflow-y-auto">
							<div className="px-6 py-2">
								<TabsContent className="m-0" value="general">
									<OutputSettingsTabSection
										description="Default profile and generated-media summary"
										icon={<Film aria-hidden="true" className="size-4" />}
										title="General"
									>
										<OutputSettingsChoice
											label="Container"
											onChange={changeContainer}
											value={containerSettingValue(activeDraft.container)}
										>
											<option value="default-output-profile">
												Default output profile (MP4)
											</option>
											{MEDIABUNNY_OUTPUT_SUPPORT.containers.map((container) => (
												<option key={container.id} value={container.id}>
													{container.label}
												</option>
											))}
										</OutputSettingsChoice>
										<OutputSettingsValidationMessage
											automaticReplacementMessage={automaticReplacementMessage}
											resolvedDraft={resolvedDraft}
											resolvedAudio={resolvedAudio}
											resolvedResolution={resolvedResolution}
											resolvedVideoQuality={resolvedVideoQuality}
											resolvedAudioQuality={resolvedAudioQuality}
										/>
									</OutputSettingsTabSection>
								</TabsContent>
								<TabsContent className="m-0" value="video">
									<OutputSettingsTabSection
										description="Video output decisions for the current media asset"
										icon={<Monitor aria-hidden="true" className="size-4" />}
										title="Video"
									>
										<OutputSettingsChoice
											label="Video codec"
											onChange={changeVideoCodec}
											value={codecSettingValue(activeDraft.videoCodec)}
										>
											<option value="preserve-source">Preserve source</option>
											{activeDraft.container.kind ===
											"default-output-profile" ? (
												<option value="default-output-profile">
													Default output profile (H.264)
												</option>
											) : null}
											{compatibleVideoCodecs.map((codec) => (
												<option key={codec} value={codec}>
													{formatCodecName(codec)}
												</option>
											))}
										</OutputSettingsChoice>
										<OutputQualityChoice
											label="Video quality"
											onBitrateChange={(bitrateBps) =>
												changeCustomBitrate("video", bitrateBps)
											}
											onChange={(value) => changeQuality("video", value)}
											setting={activeDraft.videoQuality}
										/>
										<OutputSettingsChoice
											label="Resolution"
											onChange={changeResolution}
											value={resolutionSettingValue(activeDraft.resolution)}
										>
											{resolutionChoices.map((choice) => (
												<option
													key={resolutionSettingValue(choice.setting)}
													value={resolutionSettingValue(choice.setting)}
												>
													{choice.label}
												</option>
											))}
										</OutputSettingsChoice>
										<OutputSettingsValidationMessage
											automaticReplacementMessage={automaticReplacementMessage}
											resolvedDraft={resolvedDraft}
											resolvedAudio={resolvedAudio}
											resolvedResolution={resolvedResolution}
											resolvedVideoQuality={resolvedVideoQuality}
											resolvedAudioQuality={resolvedAudioQuality}
										/>
									</OutputSettingsTabSection>
								</TabsContent>
								<TabsContent className="m-0" value="audio">
									<OutputSettingsTabSection
										description="Generated audio mix output decisions"
										icon={<Music2 aria-hidden="true" className="size-4" />}
										title="Audio"
									>
										<OutputSettingsChoice
											label="Audio codec"
											onChange={changeAudioCodec}
											value={codecSettingValue(activeDraft.audioCodec)}
										>
											<option value="no-audio">No audio</option>
											<option value="preserve-source">Preserve source</option>
											{activeDraft.container.kind ===
											"default-output-profile" ? (
												<option value="default-output-profile">
													Default output profile (AAC)
												</option>
											) : null}
											{compatibleAudioCodecs.map((codec) => (
												<option key={codec} value={codec}>
													{formatCodecName(codec)}
												</option>
											))}
										</OutputSettingsChoice>
										<OutputQualityChoice
											label="Audio quality"
											onBitrateChange={(bitrateBps) =>
												changeCustomBitrate("audio", bitrateBps)
											}
											onChange={(value) => changeQuality("audio", value)}
											disabled={activeDraft.audioCodec.kind === "no-audio"}
											setting={activeDraft.audioQuality}
										/>
										<OutputSettingsValidationMessage
											automaticReplacementMessage={automaticReplacementMessage}
											resolvedAudio={resolvedAudio}
											resolvedDraft={resolvedDraft}
											resolvedResolution={resolvedResolution}
											resolvedVideoQuality={resolvedVideoQuality}
											resolvedAudioQuality={resolvedAudioQuality}
										/>
									</OutputSettingsTabSection>
								</TabsContent>
								<TabsContent className="m-0" value="ai">
									<OutputSettingsAiDeferredSection />
								</TabsContent>
								<TabsContent className="m-0" value="subtitles">
									<OutputSettingsDeferredSection
										icon={<Captions aria-hidden="true" className="size-4" />}
										title="Subtitles"
									/>
								</TabsContent>
							</div>
						</div>
						<OutputSettingsPlan
							audioProfile={resolvedAudio}
							outputSettings={activeDraft}
							resolution={resolvedResolution}
							sourceDimensions={sourceDimensions}
							sourceResolution={sourceResolution}
							videoProfile={resolvedDraft}
						/>
					</Tabs>
					<DialogFooter className="block shrink-0 border-t border-workbench-border px-6 py-4">
						<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
							<ExportPresetControls
								draft={activeDraft}
								draftIsValid={draftIsValid}
								exportRunning={exportRunning}
								onLoadPreset={(preset) =>
									setReconciledDraft(cloneOutputSettings(preset.outputSettings))
								}
							/>
							<div>
								<Button
									className="h-10"
									onClick={() => {
										setAutomaticReplacementMessage(null);
										if (openingSnapshotRef.current !== null) {
											setDraft(cloneOutputSettings(openingSnapshotRef.current));
										}
									}}
									type="button"
									variant="ghost"
								>
									Reset
								</Button>
							</div>
							<div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
								<Button
									className="h-10"
									onClick={closeModal}
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
								<Button
									className="h-10 bg-primary px-5 text-primary-foreground hover:bg-primary/90"
									disabled={exportRunning || !draftIsValid}
									onClick={applyResolvedDraft}
									type="button"
								>
									Apply
								</Button>
							</div>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}

function OutputSettingsPlan({
	audioProfile,
	outputSettings,
	resolution,
	sourceDimensions,
	sourceResolution,
	videoProfile,
}: {
	audioProfile: ResolvedOutputAudioProfile;
	outputSettings: OutputSettings;
	resolution: ResolvedOutputResolution;
	sourceDimensions: string;
	sourceResolution?: {
		height: number;
		width: number;
	};
	videoProfile: ResolvedOutputVideoProfile;
}) {
	const resolutionLabel =
		resolution.kind === "resolved" && resolution.dimensions
			? `${resolution.dimensions.width}x${resolution.dimensions.height}`
			: sourceDimensions;
	const profileLabel =
		videoProfile.kind === "resolved"
			? `${videoProfile.container.label} / ${formatCodecName(videoProfile.videoCodec)}`
			: "Invalid Output settings";
	const audioLabel =
		audioProfile.kind === "resolved"
			? audioProfile.audioCodec
				? `${formatCodecName(audioProfile.audioCodec)} · ${audioProfile.includedTrackCount} included`
				: "No audio track"
			: "Invalid Output settings";
	const aspectRatioLabel =
		resolution.kind === "resolved" && resolution.dimensions
			? formatAspectRatio(
					resolution.dimensions.width,
					resolution.dimensions.height,
				)
			: "Source ratio";
	const scaleDirection = resolveOutputScaleDirection(
		sourceResolution,
		resolution.kind === "resolved" ? resolution.dimensions : undefined,
	);
	const scaleDescription =
		scaleDirection === "downscale"
			? `Downscale from ${sourceDimensions}`
			: scaleDirection === "upscale"
				? `Upscale from ${sourceDimensions}`
				: scaleDirection === "same"
					? "Same as source"
					: "Source comparison unavailable";

	return (
		<aside
			aria-label="Output plan"
			className="min-w-0 shrink-0 px-6 py-5 md:min-h-0 md:overflow-y-auto md:border-l md:border-workbench-border md:py-2"
		>
			<h3 className="mb-4 text-sm font-medium">Output plan</h3>
			<p
				className="mb-4 text-xs leading-5 text-muted-foreground"
				aria-label={`Output frame proportions, ${resolutionLabel}`}
			>
				{aspectRatioLabel} · {scaleDescription}
			</p>
			<dl className="grid grid-cols-2 gap-4 md:grid-cols-1 md:gap-3">
				<OutputPlanFact label="Format" value={profileLabel} />
				<OutputPlanFact label="Size" value={resolutionLabel} />
				<OutputPlanFact
					label="Video quality"
					value={formatOutputQualitySetting(outputSettings.videoQuality)}
				/>
				<OutputPlanFact label="Audio mix" value={audioLabel} />
				<OutputPlanFact
					label="Audio quality"
					value={
						outputSettings.audioCodec.kind === "no-audio"
							? "No audio"
							: formatOutputQualitySetting(outputSettings.audioQuality)
					}
				/>
			</dl>
		</aside>
	);
}

function formatAspectRatio(width: number, height: number) {
	const divisor = greatestCommonDivisor(width, height);

	return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
	let dividend = Math.abs(Math.round(left));
	let divisor = Math.abs(Math.round(right));

	while (divisor !== 0) {
		const remainder = dividend % divisor;
		dividend = divisor;
		divisor = remainder;
	}

	return dividend || 1;
}

function resolveOutputScaleDirection(
	source:
		| {
				height: number;
				width: number;
		  }
		| undefined,
	target:
		| {
				height: number;
				width: number;
		  }
		| undefined,
) {
	if (!source || !target) {
		return "unknown" as const;
	}

	const sourcePixelCount = source.width * source.height;
	const targetPixelCount = target.width * target.height;

	if (targetPixelCount < sourcePixelCount) {
		return "downscale" as const;
	}

	if (targetPixelCount > sourcePixelCount) {
		return "upscale" as const;
	}

	return "same" as const;
}

function OutputPlanFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="text-xs leading-4 text-foreground">{value}</dd>
		</div>
	);
}

function OutputSettingsChoice({
	children,
	label,
	onChange,
	value,
}: {
	children: ReactNode;
	label: string;
	onChange: (value: string) => void;
	value: string;
}) {
	return (
		<label className="grid gap-1.5 text-xs font-medium text-foreground">
			<span>{label}</span>
			<select
				aria-label={label}
				className="h-10 w-full rounded-md border border-workbench-border bg-workbench-hover/35 px-2 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:bg-transparent focus:border-workbench-focus focus:ring-2 focus:ring-workbench-focus/25"
				onChange={(event) => onChange(event.currentTarget.value)}
				value={value}
			>
				{children}
			</select>
		</label>
	);
}

function OutputQualityChoice({
	disabled = false,
	label,
	onBitrateChange,
	onChange,
	setting,
}: {
	label: string;
	onBitrateChange: (bitrateBps: number) => void;
	onChange: (value: string) => void;
	setting: OutputQualitySetting;
	disabled?: boolean;
}) {
	return (
		<fieldset
			disabled={disabled}
			className="grid min-w-0 gap-1.5 text-xs font-medium text-foreground disabled:text-muted-foreground"
		>
			<OutputSettingsChoice
				label={label}
				onChange={onChange}
				value={qualitySettingValue(setting)}
			>
				<option value="preserve-source">Preserve source</option>
				{OUTPUT_SUBJECTIVE_QUALITY_CHOICES.map(({ label, value }) => (
					<option key={value} value={value}>
						{label}
					</option>
				))}
				<option value="custom-bitrate">Custom bitrate</option>
			</OutputSettingsChoice>
			{setting.kind === "custom-bitrate" ? (
				<label className="grid gap-1.5">
					<span>Custom {label.toLowerCase()} bitrate (Mbps)</span>
					<input
						aria-label={`Custom ${label.toLowerCase()} bitrate in Mbps`}
						className="h-10 w-full rounded-md border border-workbench-border bg-workbench-hover/35 px-2 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:bg-transparent focus:border-workbench-focus focus:ring-2 focus:ring-workbench-focus/25"
						min="0.000001"
						onChange={(event) => {
							const bitrateMbps = event.currentTarget.valueAsNumber;
							onBitrateChange(
								Number.isNaN(bitrateMbps)
									? Number.NaN
									: Math.round(bitrateMbps * BITS_PER_MEGABIT),
							);
						}}
						step="0.001"
						type="number"
						value={
							Number.isNaN(setting.bitrateBps)
								? ""
								: setting.bitrateBps / BITS_PER_MEGABIT
						}
					/>
				</label>
			) : null}
		</fieldset>
	);
}

function OutputSettingsValidationMessage({
	automaticReplacementMessage,
	resolvedAudio,
	resolvedDraft,
	resolvedResolution,
	resolvedVideoQuality,
	resolvedAudioQuality,
}: {
	automaticReplacementMessage: string | null;
	resolvedAudio: ResolvedOutputAudioProfile;
	resolvedDraft: ResolvedOutputVideoProfile;
	resolvedResolution: ResolvedOutputResolution;
	resolvedVideoQuality: ResolvedOutputQuality;
	resolvedAudioQuality: ResolvedOutputQuality;
}) {
	const error =
		resolvedDraft.kind === "invalid"
			? resolvedDraft.error
			: resolvedAudio.kind === "invalid"
				? resolvedAudio.error
				: resolvedResolution.kind === "invalid"
					? resolvedResolution.error
					: resolvedVideoQuality.kind === "invalid"
						? resolvedVideoQuality.error
						: resolvedAudioQuality.kind === "invalid"
							? resolvedAudioQuality.error
							: undefined;

	if (error) {
		return (
			<p
				aria-live="polite"
				className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
				role="alert"
			>
				{error}
			</p>
		);
	}

	if (!automaticReplacementMessage) {
		return null;
	}

	return (
		<p
			aria-live="polite"
			className="rounded border border-workbench-progress/40 bg-workbench-hover/35 px-3 py-2 text-xs leading-5 text-muted-foreground"
		>
			{automaticReplacementMessage}
		</p>
	);
}

function OutputSettingsTabSection({
	children,
	title,
}: {
	children: ReactNode;
	description: string;
	icon: ReactNode;
	title: string;
}) {
	return (
		<section aria-label={title} className="flex flex-col gap-5">
			{children}
		</section>
	);
}

function OutputSettingsDeferredSection({
	icon,
	title,
}: {
	icon: ReactNode;
	title: string;
}) {
	return (
		<OutputSettingsTabSection
			description="Unavailable for this v1 browser-local output path"
			icon={icon}
			title={title}
		>
			<Separator />
			<p className="text-xs leading-5 text-muted-foreground">
				{title} output settings are deferred and cannot be applied to generated
				media yet.
			</p>
		</OutputSettingsTabSection>
	);
}

function OutputSettingsAiDeferredSection() {
	return (
		<OutputSettingsTabSection
			description="Planned browser-local AI output controls"
			icon={<Sparkles aria-hidden="true" className="size-4" />}
			title="AI"
		>
			<div className="rounded border border-workbench-border bg-workbench-hover/25 p-2.5 text-xs leading-5 text-muted-foreground">
				<div className="flex items-center justify-between gap-2">
					<span className="font-medium text-foreground">Deferred controls</span>
					<Badge variant="secondary">Disabled</Badge>
				</div>
				<p className="mt-1">
					These settings remain blocked until generated media can run AI
					processing without changing the v1 export path.
				</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-2" aria-disabled="true">
				<OutputSettingsRoadmapCard
					description="Super-resolution output after the normal resolution decision"
					icon={<Sparkles aria-hidden="true" className="size-4" />}
					title="AI Upscaling"
				>
					<OutputSettingsRoadmapFact label="Default state" value="Off" />
					<OutputSettingsRoadmapFact label="Default model" value="ESRGAN" />
					<OutputSettingsRoadmapFact
						label="Model choices"
						value={formatAiModelList(AI_UPSCALING_MODELS)}
					/>
				</OutputSettingsRoadmapCard>
				<OutputSettingsRoadmapCard
					description="Intermediate-frame generation for smoother exports"
					icon={<Zap aria-hidden="true" className="size-4" />}
					title="Frame Interpolation"
				>
					<OutputSettingsRoadmapFact label="Default state" value="Off" />
					<OutputSettingsRoadmapFact label="Default model" value="RIFE" />
					<OutputSettingsRoadmapFact label="Target frame rate" value="60 fps" />
					<OutputSettingsRoadmapFact
						label="Model choices"
						value={formatFrameInterpolationModelList(
							FRAME_INTERPOLATION_MODELS,
						)}
					/>
				</OutputSettingsRoadmapCard>
			</div>
		</OutputSettingsTabSection>
	);
}

function OutputSettingsRoadmapCard({
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
		<section className="flex flex-col gap-3 rounded border border-dashed border-workbench-border bg-workbench-hover/15 p-2.5 opacity-80">
			<div className="flex items-start gap-2">
				<div className="mt-0.5 text-muted-foreground">{icon}</div>
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">{title}</div>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{description}
					</p>
				</div>
			</div>
			<div className="flex flex-col gap-2">{children}</div>
		</section>
	);
}

function OutputSettingsRoadmapFact({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="rounded border border-workbench-border bg-workbench-hover/25 px-2 py-1.5 text-[11px]">
			<div className="text-muted-foreground">{label}</div>
			<div className="font-medium leading-5 text-foreground">{value}</div>
		</div>
	);
}

function containerForSetting(setting: OutputSettings["container"]) {
	const id =
		setting.kind === "default-output-profile"
			? DEFAULT_OUTPUT_PROFILE.container
			: setting.container;
	return MEDIABUNNY_OUTPUT_SUPPORT.containers.find(
		(container) => container.id === id,
	);
}

function containerSettingValue(setting: OutputSettings["container"]): string {
	return setting.kind === "default-output-profile"
		? "default-output-profile"
		: setting.container;
}

function codecSettingValue(setting: OutputSettings["audioCodec"]): string {
	if (setting.kind === "documented-codec") {
		return setting.codec;
	}

	return setting.kind;
}

function formatCodecName(codec: string | undefined): string {
	if (!codec) {
		return "Unknown source codec";
	}

	const normalized = codec.toLowerCase();
	if (normalized === "avc" || normalized === "h264") {
		return "AVC";
	}
	if (normalized === "hevc" || normalized === "h265") {
		return "HEVC";
	}

	return normalized.toUpperCase();
}

function resolutionSettingValue(setting: OutputSettings["resolution"]): string {
	return setting.kind === "target-dimensions"
		? `${setting.width}x${setting.height}`
		: setting.kind;
}

function qualitySettingValue(setting: OutputQualitySetting): string {
	return setting.kind === "subjective-quality" ? setting.quality : setting.kind;
}

function formatSourceDimensions(asset: ReadyMediaAsset): string {
	const videoTrack = asset.tracks.video[0];

	if (!videoTrack?.width || !videoTrack.height) {
		return "Unknown";
	}

	return `${videoTrack.width}x${videoTrack.height}`;
}

function formatAiModelList(
	models: typeof AI_UPSCALING_MODELS | typeof FRAME_INTERPOLATION_MODELS,
): string {
	return models
		.map((model) => `${model.label}: ${model.description}`)
		.join("; ");
}

function formatFrameInterpolationModelList(
	models: typeof FRAME_INTERPOLATION_MODELS,
): string {
	return models
		.map(
			(model) =>
				`${model.label}: ${model.description}, up to ${model.maxFps} fps`,
		)
		.join("; ");
}

function cloneOutputSettings(outputSettings: OutputSettings): OutputSettings {
	return {
		audioCodec: { ...outputSettings.audioCodec },
		audioQuality: { ...outputSettings.audioQuality },
		container: { ...outputSettings.container },
		resolution: { ...outputSettings.resolution },
		videoCodec: { ...outputSettings.videoCodec },
		videoQuality: { ...outputSettings.videoQuality },
	};
}
