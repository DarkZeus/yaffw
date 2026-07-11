import {
	Captions,
	Check,
	Film,
	Monitor,
	Music2,
	RotateCcw,
	Settings,
	Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
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

type OutputSettingsPanelProps = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	exportRunning: boolean;
	onApplyOutputSettings: (outputSettings: OutputSettings) => void;
	outputSettings: OutputSettings;
};

export function OutputSettingsPanel({
	asset,
	audioMix,
	exportRunning,
	onApplyOutputSettings,
	outputSettings,
}: OutputSettingsPanelProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(outputSettings);
	const [openingSnapshot, setOpeningSnapshot] = useState(outputSettings);

	function openModal() {
		const snapshot = cloneOutputSettings(outputSettings);
		setDraft(snapshot);
		setOpeningSnapshot(snapshot);
		setOpen(true);
	}

	function closeModal() {
		setOpen(false);
	}

	function applyDraft() {
		if (exportRunning) {
			return;
		}

		onApplyOutputSettings(cloneOutputSettings(draft));
		setOpen(false);
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
			codec === "default-output-profile"
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
		setting: activeDraft.audioQuality,
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
		<section
			aria-label="Output settings panel"
			className="rounded border border-workbench-border bg-workbench-lane p-2.5"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
						<Settings
							aria-hidden="true"
							className="size-4 text-workbench-progress"
						/>
						<span className="min-w-0 truncate">Output settings</span>
					</div>
					<p className="mt-1 text-[11px] leading-5 text-muted-foreground">
						{formatOutputProfileSummary(outputSettings)}
					</p>
				</div>
				<Badge className="shrink-0" variant="outline">
					{exportRunning ? "Locked" : "Applied"}
				</Badge>
			</div>
			<div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
				<OutputSettingsFact
					label="Resolution"
					value={formatResolutionSetting(outputSettings.resolution)}
				/>
				<OutputSettingsFact
					label="Video quality"
					value={formatOutputQualitySetting(outputSettings.videoQuality)}
				/>
				<OutputSettingsFact
					label="Video codec"
					value={formatCodecSetting(outputSettings.videoCodec, "video")}
				/>
				<OutputSettingsFact
					label="Audio codec"
					value={formatCodecSetting(outputSettings.audioCodec, "audio")}
				/>
			</div>
			<Button
				className="mt-2 h-8 w-full"
				disabled={exportRunning}
				onClick={openResolvedOutputSettings}
				size="sm"
				type="button"
				variant="outline"
			>
				<Settings data-icon="inline-start" />
				Output settings
			</Button>
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
				<DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-hidden border-workbench-border-strong bg-workbench-inspector p-0 text-workbench-foreground shadow-2xl shadow-black/80 sm:max-w-[42rem]">
					<DialogHeader className="border-b border-workbench-border px-4 py-4">
						<DialogTitle className="flex min-w-0 items-center gap-2 text-base">
							<Settings aria-hidden="true" className="size-4" />
							<span className="min-w-0 truncate">Output settings</span>
						</DialogTitle>
						<DialogDescription>
							Changing output settings may re-encode video and can change output
							size, quality, and processing time.
						</DialogDescription>
					</DialogHeader>
					<Tabs
						className="min-h-0 gap-0"
						defaultValue="general"
						orientation="horizontal"
					>
						<div className="border-b border-workbench-border px-4 py-3">
							<TabsList className="grid h-auto w-full grid-cols-5 bg-workbench-hover/55 p-1">
								<TabsTrigger value="general">General</TabsTrigger>
								<TabsTrigger value="video">Video</TabsTrigger>
								<TabsTrigger value="audio">Audio</TabsTrigger>
								<TabsTrigger disabled value="ai">
									AI
								</TabsTrigger>
								<TabsTrigger disabled value="subtitles">
									Subtitles
								</TabsTrigger>
							</TabsList>
						</div>
						<ScrollArea className="h-[min(27rem,calc(100dvh-15rem))]">
							<div className="px-4 py-4">
								<TabsContent className="m-0" value="general">
									<OutputSettingsTabSection
										description="Default profile and generated-media summary"
										icon={<Film aria-hidden="true" className="size-4" />}
										title="General"
									>
										<ExportPresetControls
											draft={activeDraft}
											draftIsValid={draftIsValid}
											exportRunning={exportRunning}
											onLoadPreset={(preset) =>
												setReconciledDraft(
													cloneOutputSettings(preset.outputSettings),
												)
											}
										/>
										<Separator />
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
										<OutputSettingsFactGrid>
											<OutputSettingsFact
												label="Profile"
												value={formatOutputProfileSummary(activeDraft)}
											/>
											<OutputSettingsFact
												label="Source"
												value={sourceDimensions}
											/>
											<OutputSettingsFact
												label="Tracks"
												value={`${asset.tracks.video.length} video / ${asset.tracks.audio.length} audio`}
											/>
										</OutputSettingsFactGrid>
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
										<OutputSettingsFactGrid>
											<OutputSettingsFact
												label="Resolution"
												value={formatResolutionSetting(activeDraft.resolution)}
											/>
											<OutputSettingsFact
												label="Video quality"
												value={formatOutputQualitySetting(
													activeDraft.videoQuality,
												)}
											/>
											<OutputSettingsFact
												label="Source"
												value={sourceDimensions}
											/>
										</OutputSettingsFactGrid>
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
											setting={activeDraft.audioQuality}
										/>
										<OutputSettingsFactGrid>
											<OutputSettingsFact
												label="Audio codec"
												value={formatCodecSetting(draft.audioCodec, "audio")}
											/>
											<OutputSettingsFact
												label="Audio quality"
												value={formatOutputQualitySetting(draft.audioQuality)}
											/>
											<OutputSettingsFact
												label="Included source tracks"
												value={`${resolvedAudio.kind === "resolved" ? resolvedAudio.includedTrackCount : 0}`}
											/>
											<OutputSettingsFact
												label="Generated mix"
												value={
													resolvedAudio.kind === "resolved" &&
													resolvedAudio.includedTrackCount === 0
														? "No audio track"
														: "One audio track"
												}
											/>
										</OutputSettingsFactGrid>
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
									<OutputSettingsDeferredSection
										icon={<Sparkles aria-hidden="true" className="size-4" />}
										title="AI"
									/>
								</TabsContent>
								<TabsContent className="m-0" value="subtitles">
									<OutputSettingsDeferredSection
										icon={<Captions aria-hidden="true" className="size-4" />}
										title="Subtitles"
									/>
								</TabsContent>
							</div>
						</ScrollArea>
					</Tabs>
					<DialogFooter className="border-t border-workbench-border px-4 py-3">
						<Button
							onClick={() => {
								setAutomaticReplacementMessage(null);
								setDraft(cloneOutputSettings(openingSnapshot));
							}}
							type="button"
							variant="outline"
						>
							<RotateCcw data-icon="inline-start" />
							Reset
						</Button>
						<Button onClick={closeModal} type="button" variant="outline">
							Cancel
						</Button>
						<Button
							className="bg-workbench-selected text-workbench-selected-foreground hover:bg-workbench-selected/90"
							disabled={
								exportRunning ||
								resolvedDraft.kind === "invalid" ||
								resolvedAudio.kind === "invalid" ||
								resolvedResolution.kind === "invalid" ||
								resolvedVideoQuality.kind === "invalid" ||
								resolvedAudioQuality.kind === "invalid"
							}
							onClick={applyResolvedDraft}
							type="button"
						>
							<Check data-icon="inline-start" />
							Apply
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}

function OutputSettingsFact({
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
				className="h-9 w-full rounded border border-workbench-border bg-workbench-hover/35 px-2 text-sm text-foreground outline-none focus:border-workbench-focus focus:ring-2 focus:ring-workbench-focus/25"
				onChange={(event) => onChange(event.currentTarget.value)}
				value={value}
			>
				{children}
			</select>
		</label>
	);
}

function OutputQualityChoice({
	label,
	onBitrateChange,
	onChange,
	setting,
}: {
	label: string;
	onBitrateChange: (bitrateBps: number) => void;
	onChange: (value: string) => void;
	setting: OutputQualitySetting;
}) {
	return (
		<div className="grid gap-1.5 text-xs font-medium text-foreground">
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
					<span>Custom {label.toLowerCase()} bitrate (bps)</span>
					<input
						aria-label={`Custom ${label.toLowerCase()} bitrate`}
						className="h-9 w-full rounded border border-workbench-border bg-workbench-hover/35 px-2 text-sm text-foreground outline-none focus:border-workbench-focus focus:ring-2 focus:ring-workbench-focus/25"
						min="1"
						onChange={(event) =>
							onBitrateChange(event.currentTarget.valueAsNumber)
						}
						step="1"
						type="number"
						value={Number.isNaN(setting.bitrateBps) ? "" : setting.bitrateBps}
					/>
				</label>
			) : null}
		</div>
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

function OutputSettingsFactGrid({ children }: { children: ReactNode }) {
	return <div className="grid grid-cols-2 gap-2 text-[11px]">{children}</div>;
}

function OutputSettingsTabSection({
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

function formatOutputProfileSummary(outputSettings: OutputSettings): string {
	if (
		outputSettings.container.kind === "default-output-profile" &&
		outputSettings.videoCodec.kind === "default-output-profile" &&
		outputSettings.audioCodec.kind === "default-output-profile"
	) {
		return "MP4 / H.264 video / AAC audio";
	}

	return `${formatContainerSetting(outputSettings.container)} / ${formatCodecSetting(outputSettings.videoCodec, "video")} / ${formatCodecSetting(outputSettings.audioCodec, "audio")}`;
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

function codecSettingValue(setting: OutputSettings["videoCodec"]): string {
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

function formatContainerSetting(setting: OutputSettings["container"]): string {
	if (setting.kind === "documented-container") {
		return setting.container.toUpperCase();
	}

	return "Default output profile";
}

function formatCodecSetting(
	setting: OutputSettings["videoCodec"],
	kind: "audio" | "video",
): string {
	if (setting.kind === "documented-codec") {
		return setting.codec.toUpperCase();
	}

	if (setting.kind === "preserve-source") {
		return "Preserve source";
	}

	return kind === "video"
		? DEFAULT_OUTPUT_PROFILE.videoCodec.toUpperCase()
		: DEFAULT_OUTPUT_PROFILE.audioCodec.toUpperCase();
}

function formatResolutionSetting(
	setting: OutputSettings["resolution"],
): string {
	if (setting.kind === "target-dimensions") {
		return `${setting.width}x${setting.height}`;
	}

	return "Preserve source";
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
