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
	DEFAULT_OUTPUT_PROFILE,
	type OutputSettings,
	type ReadyMediaAsset,
} from "@/editor-core/model";

type OutputSettingsPanelProps = {
	asset: ReadyMediaAsset;
	exportRunning: boolean;
	onApplyOutputSettings: (outputSettings: OutputSettings) => void;
	outputSettings: OutputSettings;
};

export function OutputSettingsPanel({
	asset,
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

	const sourceDimensions = formatSourceDimensions(asset);

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
					value={formatQualitySetting(outputSettings.videoQuality)}
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
				onClick={openModal}
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
										<OutputSettingsFactGrid>
											<OutputSettingsFact
												label="Container"
												value={formatContainerSetting(draft.container)}
											/>
											<OutputSettingsFact
												label="Profile"
												value={formatOutputProfileSummary(draft)}
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
									</OutputSettingsTabSection>
								</TabsContent>
								<TabsContent className="m-0" value="video">
									<OutputSettingsTabSection
										description="Video output decisions for the current media asset"
										icon={<Monitor aria-hidden="true" className="size-4" />}
										title="Video"
									>
										<OutputSettingsFactGrid>
											<OutputSettingsFact
												label="Resolution"
												value={formatResolutionSetting(draft.resolution)}
											/>
											<OutputSettingsFact
												label="Video codec"
												value={formatCodecSetting(draft.videoCodec, "video")}
											/>
											<OutputSettingsFact
												label="Video quality"
												value={formatQualitySetting(draft.videoQuality)}
											/>
											<OutputSettingsFact
												label="Source"
												value={sourceDimensions}
											/>
										</OutputSettingsFactGrid>
									</OutputSettingsTabSection>
								</TabsContent>
								<TabsContent className="m-0" value="audio">
									<OutputSettingsTabSection
										description="Generated audio mix output decisions"
										icon={<Music2 aria-hidden="true" className="size-4" />}
										title="Audio"
									>
										<OutputSettingsFactGrid>
											<OutputSettingsFact
												label="Audio codec"
												value={formatCodecSetting(draft.audioCodec, "audio")}
											/>
											<OutputSettingsFact
												label="Audio quality"
												value={formatQualitySetting(draft.audioQuality)}
											/>
											<OutputSettingsFact
												label="Included source tracks"
												value={`${asset.tracks.audio.length}`}
											/>
											<OutputSettingsFact
												label="Generated mix"
												value={
													asset.tracks.audio.length === 0
														? "No audio track"
														: "One audio track"
												}
											/>
										</OutputSettingsFactGrid>
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
							onClick={() => setDraft(cloneOutputSettings(openingSnapshot))}
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
							disabled={exportRunning}
							onClick={applyDraft}
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

function formatQualitySetting(setting: OutputSettings["videoQuality"]): string {
	if (setting.kind === "custom-bitrate") {
		return `${formatBitrate(setting.bitrateBps)}`;
	}

	if (setting.kind === "subjective-quality") {
		return setting.quality;
	}

	return "Preserve source";
}

function formatSourceDimensions(asset: ReadyMediaAsset): string {
	const videoTrack = asset.tracks.video[0];

	if (!videoTrack?.width || !videoTrack.height) {
		return "Unknown";
	}

	return `${videoTrack.width}x${videoTrack.height}`;
}

function formatBitrate(bitrateBps: number): string {
	if (bitrateBps >= 1_000_000) {
		return `${(bitrateBps / 1_000_000).toFixed(1)} Mbps`;
	}

	return `${Math.round(bitrateBps / 1_000)} Kbps`;
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
