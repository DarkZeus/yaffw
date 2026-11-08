import { audioMixPlanTrackOutputChannelCount } from "@/editor-core/audio-mix-plan";
import type { AudioTrackChannelMode } from "@/editor-core/model";
import { errorMessage } from "@/lib/error-message";
import {
	createPreviewMeterChannelLabels,
	normalizePreviewMeterChannelCount,
} from "../meters/preview-meter-channels";
import type {
	PreviewAudioAnalyserNodeLike,
	PreviewAudioContextLike,
	PreviewAudioEngineMeterChannel,
	PreviewAudioEngineMeterSnapshot,
	PreviewAudioEngineTrackMeterState,
	PreviewAudioGainNodeLike,
	PreviewAudioNodeLike,
	PreviewTrackGainControls,
} from "../types/preview-audio-engine.types";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import {
	type ResolvedChannelTransform,
	resolveChannelTransform,
} from "./audio-channel-analysis";
import {
	type PreviewGainChangeMode,
	createPreviewGainTransition,
} from "./preview-gain-transition";
type PreviewAudioTrackChannelRouting = {
	dispose: () => void;
	inputNode: PreviewAudioNodeLike;
};

type PreviewAudioMeterTap = {
	analysers: PreviewAudioAnalyserNodeLike[];
	dispose: () => void;
	labels: string[];
	sampleBuffers: Float32Array[];
};

type PreviewAudioMeterTapState =
	| {
			reason: string;
			status: "unavailable";
	  }
	| {
			status: "ready";
			tap: PreviewAudioMeterTap;
	  };

const PREVIEW_AUDIO_METERING_PEAK_WINDOW_SECONDS = 0.05;

export function createPreviewAudioGraph(
	audioContext: PreviewAudioContextLike,
	resources: PreviewAudioResource[],
	outputChannels: number,
) {
	const outputChannelCount = normalizePreviewMeterChannelCount(outputChannels);
	const outputGain = audioContext.createGain();
	const outputTransition = createPreviewGainTransition(outputGain.gain);
	outputGain.connect(audioContext.destination);
	const mix = audioContext.createGain();
	configurePreviewAudioOutputChannels(mix, outputChannelCount);
	mix.connect(outputGain);
	const combinedTap = createPreviewAudioMeterTapState({
		audioContext,
		channelCount: outputChannelCount,
		labels: createPreviewMeterChannelLabels(outputChannelCount),
		sourceNode: mix,
	});
	const tracks = resources.map((resource) => {
		const gainNode = audioContext.createGain();
		const transition = createPreviewGainTransition(gainNode.gain, 0);
		gainNode.connect(mix);
		return {
			resource: { ...resource },
			gainNode,
			transition,
			monitorGain: 0,
			volumeGain: 1,
			channelMode: "preserve" as AudioTrackChannelMode,
			routes: new Map<AudioTrackChannelMode, PreviewAudioTrackChannelRouting>(),
			meterTap: createPreviewAudioTrackMeterTapState({
				audioContext,
				channelMode: "preserve",
				gainNode,
				resource,
			}),
		};
	});
	function destination(trackId: string, buffer: AudioBuffer) {
		const track = tracks.find((t) => t.resource.trackId === trackId);
		if (!track) throw new Error(`Missing Preview audio graph for ${trackId}.`);
		if (track.resource.numberOfChannels !== buffer.numberOfChannels) {
			track.resource = {
				...track.resource,
				numberOfChannels: buffer.numberOfChannels,
			};
			for (const route of track.routes.values()) route.dispose();
			track.routes.clear();
			disposePreviewAudioMeterTapState(track.meterTap);
			track.meterTap = createPreviewAudioTrackMeterTapState({
				audioContext,
				channelMode: track.channelMode,
				gainNode: track.gainNode,
				resource: track.resource,
			});
		}
		const mode =
			track.channelMode === "auto-one-sided-stereo"
				? resolveChannelTransform(buffer, track.channelMode).resolvedMode
				: track.channelMode;
		let route = track.routes.get(mode);
		if (!route) {
			route = createPreviewAudioTrackChannelRouting({
				audioContext,
				channelMode: mode,
				gainNode: track.gainNode,
				resource: track.resource,
			});
			track.routes.set(mode, route);
		}
		return route.inputNode;
	}
	return {
		destination,
		setOutputGain(gain: number, mode: PreviewGainChangeMode = "immediate") {
			outputTransition.setTarget(
				clampPreviewVolume(gain),
				audioContext.currentTime,
				mode,
			);
		},
		settleGains() {
			const time = audioContext.currentTime;
			outputTransition.settle(time);
			for (const track of tracks) track.transition.settle(time);
		},
		setTrackChannelMode(index: number, mode: AudioTrackChannelMode) {
			const track = tracks[index];
			if (!track || track.channelMode === mode) return false;
			track.channelMode = mode;
			if (mode === "auto-one-sided-stereo") {
				configurePreviewAudioOutputChannels(
					track.gainNode,
					track.resource.numberOfChannels,
				);
			} else {
				track.gainNode.channelCountMode = "max";
			}
			for (const route of track.routes.values()) route.dispose();
			track.routes.clear();
			disposePreviewAudioMeterTapState(track.meterTap);
			track.meterTap = createPreviewAudioTrackMeterTapState({
				audioContext,
				channelMode: mode,
				gainNode: track.gainNode,
				resource: track.resource,
			});
			return true;
		},
		setTrackGain(
			index: number,
			{ monitorGain, volumeGain }: PreviewTrackGainControls,
			mode: PreviewGainChangeMode = "immediate",
		) {
			const track = tracks[index];
			if (!track) return;
			track.monitorGain = clampPreviewVolume(monitorGain ?? track.monitorGain);
			track.volumeGain = clampPreviewVolume(volumeGain ?? track.volumeGain);
			track.transition.setTarget(
				track.monitorGain * track.volumeGain,
				audioContext.currentTime,
				mode,
			);
		},
		readMeterSnapshot(
			playing: boolean,
			failures: ReadonlyMap<string, string>,
			isTrackRetrying: (trackId: string) => boolean = () => false,
		): PreviewAudioEngineMeterSnapshot {
			const trackStates: Record<string, PreviewAudioEngineTrackMeterState> = {};
			for (const track of tracks) {
				const trackId = track.resource.trackId;
				const failure = failures.get(trackId);
				if (failure !== undefined) {
					trackStates[trackId] = {
						reason: failure,
						retryStatus: isTrackRetrying(trackId) ? "retrying" : "available",
						status: "unavailable",
						trackId,
					};
				} else if (track.meterTap.status === "unavailable") {
					trackStates[trackId] = {
						reason: track.meterTap.reason,
						status: "unavailable",
						trackId,
					};
				} else {
					trackStates[trackId] = {
						channels: readPreviewAudioMeterTapChannels({
							playing,
							tap: track.meterTap.tap,
						}),
						status: "ready",
						trackId,
					};
				}
			}

			if (failures.size > 0 && failures.size === tracks.length) {
				return {
					trackStates,
					combinedState: {
						status: "unavailable",
						reason: "All Preview audio tracks are unavailable.",
					},
				};
			}
			if (combinedTap.status === "unavailable")
				return { trackStates, combinedState: combinedTap };

			const reasons = tracks
				.filter(
					(track) =>
						track.monitorGain > 0 && failures.has(track.resource.trackId),
				)
				.map((track) => failures.get(track.resource.trackId));
			return {
				trackStates,
				combinedState: {
					status: "ready",
					channels: readPreviewAudioMeterTapChannels({
						playing,
						tap: combinedTap.tap,
					}),
					partial: reasons.length > 0,
					reason: reasons.length
						? `Some monitored tracks are unavailable: ${reasons.join(", ")}`
						: undefined,
				},
			};
		},
		destroy() {
			const time = audioContext.currentTime;
			outputTransition.dispose(time);
			for (const track of tracks) {
				track.transition.dispose(time);
				for (const route of track.routes.values()) route.dispose();
				track.routes.clear();
				disposePreviewAudioMeterTapState(track.meterTap);
				track.gainNode.disconnect?.();
			}
			disposePreviewAudioMeterTapState(combinedTap);
			mix.disconnect?.();
			outputGain.disconnect?.();
		},
	};
}
function createPreviewAudioTrackChannelRouting({
	audioContext,
	channelMode,
	gainNode,
	resource,
}: {
	audioContext: PreviewAudioContextLike;
	channelMode: AudioTrackChannelMode;
	gainNode: PreviewAudioGainNodeLike;
	resource: PreviewAudioResource;
}): PreviewAudioTrackChannelRouting {
	const resolvedChannelMode = resolvePreviewAudioChannelMode(channelMode);

	if (
		resolvedChannelMode === "preserve" ||
		!audioContext.createChannelSplitter
	) {
		return {
			dispose: () => {},
			inputNode: gainNode,
		};
	}

	const splitter = audioContext.createChannelSplitter(
		Math.max(1, resource.numberOfChannels),
	);
	const createdNodes: PreviewAudioNodeLike[] = [splitter];

	if (
		resolvedChannelMode === "use-left-as-mono" ||
		resolvedChannelMode === "use-right-as-mono"
	) {
		const sourceChannelIndex = sourceChannelIndexForMode(
			resolvedChannelMode,
			resource,
		);
		splitter.connect(gainNode, sourceChannelIndex, 0);

		return {
			dispose: () => disconnectPreviewAudioNodes(createdNodes),
			inputNode: splitter,
		};
	}

	if (
		resolvedChannelMode === "duplicate-left-to-stereo" ||
		resolvedChannelMode === "duplicate-right-to-stereo"
	) {
		const sourceChannelIndex = sourceChannelIndexForMode(
			resolvedChannelMode,
			resource,
		);

		if (!audioContext.createChannelMerger) {
			splitter.connect(gainNode, sourceChannelIndex, 0);

			return {
				dispose: () => disconnectPreviewAudioNodes(createdNodes),
				inputNode: splitter,
			};
		}

		const merger = audioContext.createChannelMerger(
			audioMixPlanTrackOutputChannelCount({
				inputChannelCount: resource.numberOfChannels,
				resolvedChannelMode,
			}),
		);
		createdNodes.push(merger);
		splitter.connect(merger, sourceChannelIndex, 0);
		splitter.connect(merger, sourceChannelIndex, 1);
		merger.connect(gainNode);

		return {
			dispose: () => disconnectPreviewAudioNodes(createdNodes),
			inputNode: splitter,
		};
	}

	if (resolvedChannelMode === "average-to-mono") {
		for (
			let channelIndex = 0;
			channelIndex < resource.numberOfChannels;
			channelIndex += 1
		) {
			const averageGainNode = audioContext.createGain();
			averageGainNode.gain.value = 1 / Math.max(1, resource.numberOfChannels);
			createdNodes.push(averageGainNode);
			splitter.connect(averageGainNode, channelIndex, 0);
			averageGainNode.connect(gainNode);
		}

		return {
			dispose: () => disconnectPreviewAudioNodes(createdNodes),
			inputNode: splitter,
		};
	}

	return {
		dispose: () => disconnectPreviewAudioNodes(createdNodes),
		inputNode: splitter,
	};
}

function resolvePreviewAudioChannelMode(
	channelMode: AudioTrackChannelMode,
): Exclude<AudioTrackChannelMode, "auto-one-sided-stereo"> {
	return channelMode === "auto-one-sided-stereo" ? "preserve" : channelMode;
}

function sourceChannelIndexForMode(
	channelMode: ResolvedChannelTransform["resolvedMode"],
	audioBuffer: Pick<AudioBuffer, "numberOfChannels">,
) {
	if (
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.min(1, audioBuffer.numberOfChannels - 1);
	}

	return 0;
}

function configurePreviewAudioOutputChannels(
	node: PreviewAudioNodeLike,
	outputChannels: number,
) {
	node.channelCount = outputChannels;
	node.channelCountMode = "explicit";
	node.channelInterpretation = "speakers";
}

function createPreviewAudioTrackMeterTapState({
	audioContext,
	channelMode,
	gainNode,
	resource,
}: {
	audioContext: PreviewAudioContextLike;
	channelMode: AudioTrackChannelMode;
	gainNode: PreviewAudioGainNodeLike;
	resource: PreviewAudioResource;
}): PreviewAudioMeterTapState {
	const resolvedMode = resolvePreviewAudioChannelMode(channelMode);
	const channelCount = normalizePreviewMeterChannelCount(
		audioMixPlanTrackOutputChannelCount({
			inputChannelCount: resource.numberOfChannels,
			resolvedChannelMode: resolvedMode,
		}),
	);

	return createPreviewAudioMeterTapState({
		audioContext,
		channelCount,
		labels: createPreviewMeterChannelLabels(channelCount),
		sourceNode: gainNode,
	});
}

function createPreviewAudioMeterTapState({
	audioContext,
	channelCount,
	labels,
	sourceNode,
}: {
	audioContext: PreviewAudioContextLike;
	channelCount: number;
	labels: string[];
	sourceNode: PreviewAudioNodeLike;
}): PreviewAudioMeterTapState {
	const createdNodes: PreviewAudioNodeLike[] = [];
	let splitter: PreviewAudioNodeLike | null = null;

	try {
		splitter = audioContext.createChannelSplitter?.(channelCount) ?? null;
		if (!splitter) {
			throw new Error("Per-channel Web Audio splitting is unavailable.");
		}

		createdNodes.push(splitter);
		sourceNode.connect(splitter);
		const fftSize = previewAudioMeterFftSize(audioContext.sampleRate);
		const analysers = Array.from(
			{ length: channelCount },
			(_, channelIndex) => {
				const analyser = audioContext.createAnalyser();
				analyser.fftSize = fftSize;
				splitter?.connect(analyser, channelIndex, 0);
				createdNodes.push(analyser);

				return analyser;
			},
		);

		return {
			status: "ready",
			tap: {
				analysers,
				dispose: () => {
					sourceNode.disconnect?.(splitter ?? undefined);
					disconnectPreviewAudioNodes(createdNodes);
				},
				labels,
				sampleBuffers: analysers.map(
					(analyser) => new Float32Array(analyser.fftSize),
				),
			},
		};
	} catch (error) {
		if (splitter) {
			sourceNode.disconnect?.(splitter);
		}
		disconnectPreviewAudioNodes(createdNodes);

		return {
			reason: `Preview audio engine meter tap unavailable: ${errorMessage(error)}`,
			status: "unavailable",
		};
	}
}

function disposePreviewAudioMeterTapState(state: PreviewAudioMeterTapState) {
	if (state.status === "ready") {
		state.tap.dispose();
	}
}

function readPreviewAudioMeterTapChannels({
	playing,
	tap,
}: {
	playing: boolean;
	tap: PreviewAudioMeterTap;
}): PreviewAudioEngineMeterChannel[] {
	const peaks = tap.analysers.map((analyser, channelIndex) => {
		if (!playing) {
			return 0;
		}

		const samples = tap.sampleBuffers[channelIndex];
		if (!samples) {
			return 0;
		}

		analyser.getFloatTimeDomainData(samples);
		let peak = 0;
		for (const sample of samples) {
			peak = Math.max(peak, Math.abs(sample));
		}

		return peak;
	});

	return createPreviewAudioMeterChannels({ labels: tap.labels, peaks });
}

function previewAudioMeterFftSize(sampleRate: number) {
	const targetSampleCount =
		positiveFiniteNumberOr(sampleRate, 48_000) *
		PREVIEW_AUDIO_METERING_PEAK_WINDOW_SECONDS;
	const lowerPower = 2 ** Math.floor(Math.log2(targetSampleCount));
	const upperPower = lowerPower * 2;
	const nearestPower =
		targetSampleCount - lowerPower <= upperPower - targetSampleCount
			? lowerPower
			: upperPower;

	return Math.max(32, Math.min(32_768, nearestPower));
}

function positiveFiniteNumberOr(value: number, fallback: number) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createPreviewAudioMeterChannels({
	labels,
	peaks,
}: {
	labels: string[];
	peaks: number[];
}): PreviewAudioEngineMeterChannel[] {
	return peaks.map((peak, channelIndex) => ({
		label: labels[channelIndex] ?? `Ch ${channelIndex + 1}`,
		peak: Number.isFinite(peak) ? Math.max(0, peak) : 0,
	}));
}

function disconnectPreviewAudioNodes(nodes: PreviewAudioNodeLike[]) {
	for (const node of nodes) {
		node.disconnect?.();
	}
}

function clampPreviewVolume(volume: number) {
	if (!Number.isFinite(volume)) {
		return 1;
	}

	return Math.max(0, Math.min(volume, 1));
}
