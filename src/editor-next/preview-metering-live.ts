import { audioTrackVolumePercentToGain } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	AudioTrackChannelMode,
	MediaTimeUs,
} from "@/editor-core/model";
import {
	outputChannelCountForMode,
	resolveChannelTransform,
} from "./browser-audio-mix";
import type { ResolvedChannelTransform } from "./browser-audio-mix.types";
import type { PreviewLevelMeterChannel } from "./preview-level-meter";
import { previewPeakMeterVisualRange } from "./preview-level-meter";
import type {
	PreviewMeteringPreparedTrack,
	PreviewMeteringTrackStates,
} from "./preview-metering-preparation.types";

const PREVIEW_METERING_PEAK_WINDOW_US = 50_000;
const PREVIEW_METERING_CLIP_HOLD_MS = 750;
const ONE_SIDED_ACTIVE_PEAK_THRESHOLD = 0.001;
const ONE_SIDED_ACTIVE_RMS_THRESHOLD = 0.0001;

export type LivePreviewMeteringTrackState =
	| {
			status: "preparing";
			trackId: string;
	  }
	| {
			channels: PreviewLevelMeterChannel[];
			excluded: boolean;
			status: "ready";
			trackId: string;
	  }
	| {
			reason: string;
			status: "unavailable";
			trackId: string;
	  };

export type LivePreviewMeteringTrackStates = Record<
	string,
	LivePreviewMeteringTrackState
>;

export type LivePreviewMeteringClock = {
	getIsPlaying: () => boolean;
	getPlayheadUs: () => MediaTimeUs;
};

export type LivePreviewMeteringClipHoldState = Record<
	string,
	Record<number, number>
>;

export type CreateLivePreviewMeteringTrackStatesOptions = {
	audioMix: AudioMix;
	isPlaying: boolean;
	nowMs: number;
	playheadUs: MediaTimeUs;
	previousClipHoldState?: LivePreviewMeteringClipHoldState;
	soloedAudioTrackId: string | null;
	trackStates: PreviewMeteringTrackStates;
};

export type LivePreviewMeteringTrackStatesResult = {
	clipHoldState: LivePreviewMeteringClipHoldState;
	trackStates: LivePreviewMeteringTrackStates;
};

export function createLivePreviewMeteringTrackStates({
	audioMix,
	isPlaying,
	nowMs,
	playheadUs,
	previousClipHoldState = {},
	soloedAudioTrackId,
	trackStates,
}: CreateLivePreviewMeteringTrackStatesOptions): LivePreviewMeteringTrackStatesResult {
	const clipHoldState: LivePreviewMeteringClipHoldState = {};
	const liveTrackStates: LivePreviewMeteringTrackStates = {};

	for (const [trackId, state] of Object.entries(trackStates)) {
		if (state.status !== "ready") {
			liveTrackStates[trackId] = state;
			continue;
		}

		const decision = audioMix.tracks[trackId];
		const excluded =
			decision?.include === false && soloedAudioTrackId !== trackId;
		const channelMode = decision?.channelMode ?? "preserve";
		const channelPlan = createTrackChannelPlan(state.prepared, channelMode);

		if (!isPlaying || excluded) {
			liveTrackStates[trackId] = {
				channels: channelPlan.labels.map((label) => ({
					clipHeld: false,
					label,
					peakDb: previewPeakMeterVisualRange.floorDb,
				})),
				excluded,
				status: "ready",
				trackId,
			};
			continue;
		}

		const volumeGain = audioTrackVolumePercentToGain(
			decision?.volumePercent ?? 100,
		);
		const peaks = sampleTrackPeakWindow({
			channelPlan,
			playheadUs,
			prepared: state.prepared,
			volumeGain,
		});

		liveTrackStates[trackId] = {
			channels: peaks.map((peak, channelIndex) => {
				const clipped = peak >= 1;
				const lastClipMs = clipped
					? nowMs
					: previousClipHoldState[trackId]?.[channelIndex];
				const clipHeld =
					typeof lastClipMs === "number" &&
					nowMs - lastClipMs <= PREVIEW_METERING_CLIP_HOLD_MS;

				if (clipHeld && typeof lastClipMs === "number") {
					clipHoldState[trackId] = {
						...(clipHoldState[trackId] ?? {}),
						[channelIndex]: lastClipMs,
					};
				}

				return {
					clipHeld,
					label: channelPlan.labels[channelIndex],
					peakDb: linearPeakToDb(peak),
				};
			}),
			excluded: false,
			status: "ready",
			trackId,
		};
	}

	return {
		clipHoldState,
		trackStates: liveTrackStates,
	};
}

type TrackChannelPlan = {
	compensationGain: number;
	labels: string[];
	outputChannels: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
};

function createTrackChannelPlan(
	prepared: PreviewMeteringPreparedTrack,
	channelMode: AudioTrackChannelMode,
): TrackChannelPlan {
	const channelTransform = resolveChannelTransform(
		prepared.audioBuffer,
		channelMode,
	);
	const outputChannels = outputChannelCountForMode(
		prepared.audioBuffer,
		channelTransform.resolvedMode,
	);

	return {
		compensationGain: channelCompensationGain({
			channelTransform,
			outputChannels,
		}),
		labels: createChannelLabels({
			channelLabels: prepared.channelLabels,
			outputChannels,
			resolvedMode: channelTransform.resolvedMode,
		}),
		outputChannels,
		resolvedMode: channelTransform.resolvedMode,
	};
}

function sampleTrackPeakWindow({
	channelPlan,
	playheadUs,
	prepared,
	volumeGain,
}: {
	channelPlan: TrackChannelPlan;
	playheadUs: MediaTimeUs;
	prepared: PreviewMeteringPreparedTrack;
	volumeGain: number;
}): number[] {
	const audioBuffer = prepared.audioBuffer;
	const playheadSeconds =
		playheadUs / 1_000_000 - prepared.startPositionSeconds;
	const centerFrame = Math.round(playheadSeconds * audioBuffer.sampleRate);
	const halfWindowFrames = Math.max(
		1,
		Math.round(
			(PREVIEW_METERING_PEAK_WINDOW_US / 1_000_000 / 2) *
				audioBuffer.sampleRate,
		),
	);
	const startFrame = Math.max(0, centerFrame - halfWindowFrames);
	const endFrame = Math.min(audioBuffer.length, centerFrame + halfWindowFrames);

	if (startFrame >= endFrame) {
		return Array.from({ length: channelPlan.outputChannels }, () => 0);
	}

	return Array.from(
		{ length: channelPlan.outputChannels },
		(_, channelIndex) => {
			let peak = 0;

			for (
				let frameIndex = startFrame;
				frameIndex < endFrame;
				frameIndex += 1
			) {
				peak = Math.max(
					peak,
					Math.abs(
						readTransformedSample({
							audioBuffer,
							channelIndex,
							frameIndex,
							resolvedMode: channelPlan.resolvedMode,
						}),
					),
				);
			}

			return peak * channelPlan.compensationGain * volumeGain;
		},
	);
}

function readTransformedSample({
	audioBuffer,
	channelIndex,
	frameIndex,
	resolvedMode,
}: {
	audioBuffer: AudioBuffer;
	channelIndex: number;
	frameIndex: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
}): number {
	if (resolvedMode === "preserve") {
		return readSourceSample(audioBuffer, channelIndex, frameIndex);
	}

	if (
		resolvedMode === "use-left-as-mono" ||
		resolvedMode === "duplicate-left-to-stereo"
	) {
		return readSourceSample(audioBuffer, 0, frameIndex);
	}

	if (
		resolvedMode === "use-right-as-mono" ||
		resolvedMode === "duplicate-right-to-stereo"
	) {
		return readSourceSample(
			audioBuffer,
			Math.min(1, audioBuffer.numberOfChannels - 1),
			frameIndex,
		);
	}

	if (resolvedMode === "average-to-mono") {
		let sample = 0;

		for (
			let channel = 0;
			channel < audioBuffer.numberOfChannels;
			channel += 1
		) {
			sample += readSourceSample(audioBuffer, channel, frameIndex);
		}

		return sample / Math.max(1, audioBuffer.numberOfChannels);
	}

	return readSourceSample(audioBuffer, channelIndex, frameIndex);
}

function readSourceSample(
	audioBuffer: AudioBuffer,
	channelIndex: number,
	frameIndex: number,
): number {
	const sourceChannel = Math.min(
		channelIndex,
		audioBuffer.numberOfChannels - 1,
	);

	return audioBuffer.getChannelData(sourceChannel)[frameIndex] ?? 0;
}

function createChannelLabels({
	channelLabels,
	outputChannels,
	resolvedMode,
}: {
	channelLabels: string[];
	outputChannels: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
}): string[] {
	if (
		resolvedMode === "use-left-as-mono" ||
		resolvedMode === "use-right-as-mono" ||
		resolvedMode === "average-to-mono"
	) {
		return ["Mono"];
	}

	if (
		outputChannels === 2 &&
		(resolvedMode === "duplicate-left-to-stereo" ||
			resolvedMode === "duplicate-right-to-stereo")
	) {
		return ["Left", "Right"];
	}

	return Array.from(
		{ length: outputChannels },
		(_, channelIndex) =>
			channelLabels[channelIndex] ?? `Ch ${channelIndex + 1}`,
	);
}

function channelCompensationGain({
	channelTransform,
	outputChannels,
}: {
	channelTransform: ResolvedChannelTransform;
	outputChannels: number;
}): number {
	const activeInputChannelCount = channelTransform.analysis.channels.filter(
		(channel) =>
			channel.peak >= ONE_SIDED_ACTIVE_PEAK_THRESHOLD ||
			channel.rms >= ONE_SIDED_ACTIVE_RMS_THRESHOLD,
	).length;
	const effectiveOutputChannels =
		channelTransform.resolvedMode === "use-left-as-mono" ||
		channelTransform.resolvedMode === "use-right-as-mono" ||
		channelTransform.resolvedMode === "duplicate-left-to-stereo" ||
		channelTransform.resolvedMode === "duplicate-right-to-stereo"
			? Math.max(2, outputChannels)
			: outputChannels;
	const sourceChannelMode =
		channelTransform.resolvedMode === "use-left-as-mono" ||
		channelTransform.resolvedMode === "use-right-as-mono" ||
		channelTransform.resolvedMode === "duplicate-left-to-stereo" ||
		channelTransform.resolvedMode === "duplicate-right-to-stereo";

	if (
		!sourceChannelMode ||
		channelTransform.analysis.oneSidedStereo === null ||
		activeInputChannelCount !== 1 ||
		effectiveOutputChannels <= activeInputChannelCount
	) {
		return 1;
	}

	return Math.sqrt(activeInputChannelCount / effectiveOutputChannels);
}

function linearPeakToDb(peak: number): number {
	if (!Number.isFinite(peak) || peak <= 0) {
		return previewPeakMeterVisualRange.floorDb;
	}

	return Math.min(
		previewPeakMeterVisualRange.ceilingDb,
		Math.max(previewPeakMeterVisualRange.floorDb, 20 * Math.log10(peak)),
	);
}
