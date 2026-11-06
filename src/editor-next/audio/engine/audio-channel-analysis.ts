import type { AudioTrackChannelMode } from "@/editor-core/model";

const ONE_SIDED_ACTIVE_PEAK_THRESHOLD = 0.001;
const ONE_SIDED_ACTIVE_RMS_THRESHOLD = 0.0001;
const ONE_SIDED_RELATIVE_SILENCE_RATIO = 0.01;

export type ChannelAnalysis = {
	channels: { peak: number; rms: number }[];
	oneSidedStereo: "left-active" | "right-active" | null;
};

export type ResolvedChannelTransform = {
	analysis: ChannelAnalysis;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
};

export function resolveChannelTransform(
	audioBuffer: AudioBuffer,
	requestedMode: AudioTrackChannelMode,
): ResolvedChannelTransform {
	const analysis = analyzeChannelActivity(audioBuffer);

	if (requestedMode !== "auto-one-sided-stereo") {
		return {
			analysis,
			resolvedMode: requestedMode,
		};
	}

	if (analysis.oneSidedStereo === "left-active") {
		return {
			analysis,
			resolvedMode: "use-left-as-mono",
		};
	}

	if (analysis.oneSidedStereo === "right-active") {
		return {
			analysis,
			resolvedMode: "use-right-as-mono",
		};
	}

	return {
		analysis,
		resolvedMode: "preserve",
	};
}

function analyzeChannelActivity(audioBuffer: AudioBuffer): ChannelAnalysis {
	const channels = Array.from(
		{ length: audioBuffer.numberOfChannels },
		(_, channel) => analyzeChannel(audioBuffer.getChannelData(channel)),
	);

	if (channels.length < 2) {
		return {
			channels,
			oneSidedStereo: null,
		};
	}

	const left = channels[0];
	const right = channels[1];
	const leftActive = isChannelActive(left);
	const rightActive = isChannelActive(right);

	if (leftActive && isChannelSilentComparedTo(right, left)) {
		return {
			channels,
			oneSidedStereo: "left-active",
		};
	}

	if (rightActive && isChannelSilentComparedTo(left, right)) {
		return {
			channels,
			oneSidedStereo: "right-active",
		};
	}

	return {
		channels,
		oneSidedStereo: null,
	};
}

function analyzeChannel(channelData: Float32Array) {
	let peak = 0;
	let squareSum = 0;

	for (const sample of channelData) {
		const absoluteSample = Math.abs(sample);
		peak = Math.max(peak, absoluteSample);
		squareSum += sample * sample;
	}

	return {
		peak,
		rms: Math.sqrt(squareSum / Math.max(1, channelData.length)),
	};
}

export function isChannelActive(channel: {
	peak: number;
	rms: number;
}): boolean {
	return (
		channel.peak >= ONE_SIDED_ACTIVE_PEAK_THRESHOLD ||
		channel.rms >= ONE_SIDED_ACTIVE_RMS_THRESHOLD
	);
}

function isChannelSilentComparedTo(
	candidate: { peak: number; rms: number },
	reference: { peak: number; rms: number },
): boolean {
	return (
		candidate.peak <=
			Math.max(
				ONE_SIDED_ACTIVE_PEAK_THRESHOLD,
				reference.peak * ONE_SIDED_RELATIVE_SILENCE_RATIO,
			) &&
		candidate.rms <=
			Math.max(
				ONE_SIDED_ACTIVE_RMS_THRESHOLD,
				reference.rms * ONE_SIDED_RELATIVE_SILENCE_RATIO,
			)
	);
}
