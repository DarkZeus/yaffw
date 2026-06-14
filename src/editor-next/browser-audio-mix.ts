import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";

import {
	DEFAULT_AUDIO_MIX_FINAL_PEAK_GUARD_DB,
	audioTrackVolumePercentToGain,
} from "@/editor-core/audio-mix";
import type {
	AudioMixTrackDecision,
	AudioTrackChannelMode,
} from "@/editor-core/model";

import type {
	BrowserAudioMixRequest,
	BrowserAudioMixResult,
	ChannelAnalysis,
	ResolvedChannelTransform,
} from "./browser-audio-mix.types";
import {
	type DisposableMediaWorkScope,
	createDisposableMediaCleanup,
	withDisposableMediaWorkScope,
} from "./disposable-media-work-scope";

const ONE_SIDED_ACTIVE_PEAK_THRESHOLD = 0.001;
const ONE_SIDED_ACTIVE_RMS_THRESHOLD = 0.0001;
const ONE_SIDED_RELATIVE_SILENCE_RATIO = 0.01;

export async function renderBrowserAudioMix({
	audioMix,
	selection,
	signal,
	source,
}: BrowserAudioMixRequest): Promise<BrowserAudioMixResult | null> {
	return withDisposableMediaWorkScope(async (scope) => {
		throwIfAborted(signal);

		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source),
			}),
		);
		const inputTracks = await input.getAudioTracks();
		const selectedTracks = inputTracks
			.map((track, trackIndex) => ({
				decision: audioMix.tracks[String(track.id)],
				track,
				trackIndex,
			}))
			.filter(
				(
					candidate,
				): candidate is typeof candidate & {
					decision: AudioMixTrackDecision;
				} =>
					Boolean(candidate.decision?.include) &&
					(candidate.decision?.volumePercent ?? 0) > 0,
			);

		if (selectedTracks.length === 0) {
			return null;
		}

		const startSeconds = selection.startUs / 1_000_000;
		const endSeconds = selection.endUs / 1_000_000;
		const decodedTracks = [];

		for (const { decision, track } of selectedTracks) {
			throwIfAborted(signal);
			const decoded = await decodeAudioTrackRange({
				endSeconds,
				signal,
				scope,
				startSeconds,
				track,
			});

			if (decoded.length === 0) {
				continue;
			}

			decodedTracks.push({
				decision,
				decoded,
			});
		}

		if (decodedTracks.length === 0) {
			return null;
		}

		const sampleRate = decodedTracks[0]?.decoded.sampleRate ?? 48_000;
		const outputChannels = audioMix.outputChannels;
		const durationSeconds = Math.max(0, endSeconds - startSeconds);
		const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
		const context = new OfflineAudioContext(
			outputChannels,
			frameCount,
			sampleRate,
		);

		for (const { decision, decoded } of decodedTracks) {
			throwIfAborted(signal);

			const channelTransform = resolveChannelTransform(
				decoded,
				decision.channelMode,
			);
			const transformed = createTransformedAudioBuffer(decoded, {
				channelMode: channelTransform.resolvedMode,
				outputChannels: outputChannelCountForMode(
					decoded,
					channelTransform.resolvedMode,
				),
			});
			const channelCompensated = createChannelCompensatedAudioBuffer({
				channelTransform,
				inputBuffer: decoded,
				outputBuffer: transformed,
			});
			const volumeAdjusted = applyGainToAudioBuffer(
				channelCompensated,
				audioTrackVolumePercentToGain(decision.volumePercent),
			);
			const sourceNode = context.createBufferSource();
			sourceNode.buffer = volumeAdjusted;
			sourceNode.connect(context.destination);
			sourceNode.start(0);
		}

		const rendered = await context.startRendering();
		throwIfAborted(signal);
		const peakSafe = createPeakSafeAudioBuffer(
			rendered,
			audioMix.finalPeakGuardDb,
		);

		return {
			audioBuffer: peakSafe,
			includedTrackCount: decodedTracks.length,
		};
	});
}

async function decodeAudioTrackRange({
	endSeconds,
	signal,
	scope,
	startSeconds,
	track,
}: {
	endSeconds: number;
	signal: AbortSignal;
	scope: DisposableMediaWorkScope;
	startSeconds: number;
	track: {
		numberOfChannels: number;
		sampleRate: number;
	} & ConstructorParameters<typeof AudioSampleSink>[0];
}): Promise<AudioBuffer> {
	const sampleRate = track.sampleRate || 48_000;
	const numberOfChannels = track.numberOfChannels || 1;
	const outputLength = Math.max(
		1,
		Math.ceil((endSeconds - startSeconds) * sampleRate),
	);
	const output = createAudioBuffer({
		length: outputLength,
		numberOfChannels,
		sampleRate,
	});
	const sink = new AudioSampleSink(track);

	for await (const sample of sink.samples(startSeconds, endSeconds)) {
		throwIfAborted(signal);
		const closeSample = createDisposableMediaCleanup(async () => {
			sample.close();
		});
		scope.registerCleanup(closeSample);

		try {
			const sampleBuffer = sample.toAudioBuffer();

			if (sampleBuffer.sampleRate !== sampleRate) {
				throw new Error(
					`Decoded sample rate changed from ${sampleRate}Hz to ${sampleBuffer.sampleRate}Hz.`,
				);
			}

			const sourceStartFrame = Math.max(
				0,
				Math.floor((startSeconds - sample.timestamp) * sampleRate),
			);
			const targetStartFrame = Math.max(
				0,
				Math.round(
					(sample.timestamp + sourceStartFrame / sampleRate - startSeconds) *
						sampleRate,
				),
			);
			const frameCount = Math.max(
				0,
				Math.min(
					sampleBuffer.length - sourceStartFrame,
					output.length - targetStartFrame,
				),
			);

			for (
				let channel = 0;
				channel <
				Math.min(output.numberOfChannels, sampleBuffer.numberOfChannels);
				channel += 1
			) {
				const channelData = new Float32Array(frameCount);
				sampleBuffer.copyFromChannel(channelData, channel, sourceStartFrame);
				output.copyToChannel(channelData, channel, targetStartFrame);
			}
		} finally {
			await closeSample();
		}
	}

	return output;
}

export function resolveChannelTransform(
	audioBuffer: AudioBuffer,
	requestedMode: AudioTrackChannelMode,
): ResolvedChannelTransform {
	const analysis = analyzeChannelActivity(audioBuffer);

	if (requestedMode !== "auto-one-sided-stereo") {
		return {
			analysis,
			requestedMode,
			resolvedMode: requestedMode,
		};
	}

	if (analysis.oneSidedStereo === "left-active") {
		return {
			analysis,
			requestedMode,
			resolvedMode: "use-left-as-mono",
		};
	}

	if (analysis.oneSidedStereo === "right-active") {
		return {
			analysis,
			requestedMode,
			resolvedMode: "use-right-as-mono",
		};
	}

	return {
		analysis,
		requestedMode,
		resolvedMode: "preserve",
	};
}

export function createTransformedAudioBuffer(
	audioBuffer: AudioBuffer,
	{
		channelMode,
		outputChannels,
	}: {
		channelMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
		outputChannels: number;
	},
): AudioBuffer {
	const transformed = createAudioBuffer({
		length: audioBuffer.length,
		numberOfChannels: outputChannels,
		sampleRate: audioBuffer.sampleRate,
	});

	if (channelMode === "preserve") {
		if (outputChannels === 1) {
			const mono = averageChannels(audioBuffer);
			transformed.copyToChannel(mono, 0);
			return transformed;
		}

		for (let channel = 0; channel < outputChannels; channel += 1) {
			const sourceChannel = Math.min(channel, audioBuffer.numberOfChannels - 1);
			transformed.copyToChannel(
				audioBuffer.getChannelData(sourceChannel),
				channel,
			);
		}
		return transformed;
	}

	if (
		channelMode === "use-left-as-mono" ||
		channelMode === "duplicate-left-to-stereo"
	) {
		copySourceChannelToAllOutputs(audioBuffer, transformed, 0);
		return transformed;
	}

	if (
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		copySourceChannelToAllOutputs(
			audioBuffer,
			transformed,
			Math.min(1, audioBuffer.numberOfChannels - 1),
		);
		return transformed;
	}

	if (channelMode === "average-to-mono") {
		const mono = averageChannels(audioBuffer);
		for (let channel = 0; channel < outputChannels; channel += 1) {
			transformed.copyToChannel(mono, channel);
		}
		return transformed;
	}

	return audioBuffer;
}

export function outputChannelCountForMode(
	audioBuffer: AudioBuffer,
	channelMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">,
): number {
	if (
		channelMode === "duplicate-left-to-stereo" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.max(2, audioBuffer.numberOfChannels);
	}

	if (channelMode === "preserve") {
		return audioBuffer.numberOfChannels;
	}

	return 1;
}

export function createChannelCompensatedAudioBuffer({
	channelTransform,
	inputBuffer,
	outputBuffer,
}: {
	channelTransform: ResolvedChannelTransform;
	inputBuffer: AudioBuffer;
	outputBuffer: AudioBuffer;
}): AudioBuffer {
	const sourceChannel = sourceChannelForChannelMode(
		channelTransform.resolvedMode,
		inputBuffer,
	);
	const activeInputChannelCount = channelTransform.analysis.channels.filter(
		(channel) => isChannelActive(channel),
	).length;
	const effectiveOutputChannelCount = effectivePlaybackChannelCountForBuffer({
		channelMode: channelTransform.resolvedMode,
		outputBuffer,
	});
	const shouldCompensate =
		sourceChannel !== null &&
		channelTransform.analysis.oneSidedStereo !== null &&
		activeInputChannelCount === 1 &&
		effectiveOutputChannelCount > activeInputChannelCount;

	if (!shouldCompensate) {
		return outputBuffer;
	}

	return applyGainToAudioBuffer(
		outputBuffer,
		Math.sqrt(activeInputChannelCount / effectiveOutputChannelCount),
	);
}

export function createPeakSafeAudioBuffer(
	audioBuffer: AudioBuffer,
	finalPeakGuardDb: number,
): AudioBuffer {
	const peak = measureAudioBufferPeak(audioBuffer);
	const peakSafetyTarget = dbToLinear(
		Number.isFinite(finalPeakGuardDb)
			? finalPeakGuardDb
			: DEFAULT_AUDIO_MIX_FINAL_PEAK_GUARD_DB,
	);

	if (peak <= peakSafetyTarget) {
		return audioBuffer;
	}

	return applyGainToAudioBuffer(audioBuffer, peakSafetyTarget / peak);
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
			reason: "less-than-two-channels",
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
			reason: "left-active-right-silent",
		};
	}

	if (rightActive && isChannelSilentComparedTo(left, right)) {
		return {
			channels,
			oneSidedStereo: "right-active",
			reason: "right-active-left-silent",
		};
	}

	return {
		channels,
		oneSidedStereo: null,
		reason:
			leftActive || rightActive ? "both-channels-have-signal" : "both-silent",
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

function isChannelActive(channel: { peak: number; rms: number }): boolean {
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

function sourceChannelForChannelMode(
	channelMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">,
	inputBuffer: AudioBuffer,
): number | null {
	if (
		channelMode === "use-left-as-mono" ||
		channelMode === "duplicate-left-to-stereo"
	) {
		return 0;
	}

	if (
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.min(1, inputBuffer.numberOfChannels - 1);
	}

	return null;
}

function effectivePlaybackChannelCountForBuffer({
	channelMode,
	outputBuffer,
}: {
	channelMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
	outputBuffer: AudioBuffer;
}): number {
	if (
		channelMode === "use-left-as-mono" ||
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-left-to-stereo" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.max(2, outputBuffer.numberOfChannels);
	}

	return outputBuffer.numberOfChannels;
}

function copySourceChannelToAllOutputs(
	audioBuffer: AudioBuffer,
	transformed: AudioBuffer,
	sourceChannel: number,
) {
	const sourceData = audioBuffer.getChannelData(sourceChannel);

	for (let channel = 0; channel < transformed.numberOfChannels; channel += 1) {
		transformed.copyToChannel(sourceData, channel);
	}
}

function averageChannels(audioBuffer: AudioBuffer): Float32Array {
	const mono = new Float32Array(audioBuffer.length);

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const data = audioBuffer.getChannelData(channel);

		for (let index = 0; index < data.length; index += 1) {
			mono[index] += data[index] / audioBuffer.numberOfChannels;
		}
	}

	return mono;
}

function measureAudioBufferPeak(audioBuffer: AudioBuffer): number {
	let peak = 0;

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const channelData = audioBuffer.getChannelData(channel);

		for (const sample of channelData) {
			peak = Math.max(peak, Math.abs(sample));
		}
	}

	return peak;
}

function applyGainToAudioBuffer(
	audioBuffer: AudioBuffer,
	gain: number,
): AudioBuffer {
	if (gain === 1) {
		return audioBuffer;
	}

	const adjustedBuffer = createAudioBuffer({
		length: audioBuffer.length,
		numberOfChannels: audioBuffer.numberOfChannels,
		sampleRate: audioBuffer.sampleRate,
	});

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const sourceData = audioBuffer.getChannelData(channel);
		const outputData = adjustedBuffer.getChannelData(channel);

		for (let index = 0; index < sourceData.length; index += 1) {
			outputData[index] = sourceData[index] * gain;
		}
	}

	return adjustedBuffer;
}

export function createAudioBuffer({
	length,
	numberOfChannels,
	sampleRate,
}: {
	length: number;
	numberOfChannels: number;
	sampleRate: number;
}): AudioBuffer {
	if (typeof AudioBuffer !== "undefined") {
		return new AudioBuffer({
			length,
			numberOfChannels,
			sampleRate,
		});
	}

	return new OfflineAudioContext(
		numberOfChannels,
		length,
		sampleRate,
	).createBuffer(numberOfChannels, length, sampleRate);
}

function dbToLinear(db: number): number {
	return 10 ** (db / 20);
}

function throwIfAborted(signal: AbortSignal) {
	if (!signal.aborted) {
		return;
	}

	const error = new Error("Audio mix rendering was aborted.");
	error.name = "AbortError";
	throw error;
}
