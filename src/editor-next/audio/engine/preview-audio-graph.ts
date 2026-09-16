import { audioMixPlanTrackOutputChannelCount } from "@/editor-core/audio-mix-plan";
import type { AudioTrackChannelMode } from "@/editor-core/model";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import {
	type ResolvedChannelTransform,
	resolveChannelTransform,
} from "./browser-audio-mix";
import type {
	PreviewAudioAnalyserNodeLike,
	PreviewAudioContextLike,
	PreviewAudioEngineMeterChannel,
	PreviewAudioEngineMeterSnapshot,
	PreviewAudioEngineTrackMeterState,
	PreviewAudioGainNodeLike,
	PreviewAudioNodeLike,
} from "./preview-audio-engine";
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
	const outputChannelCount =
		normalizePreviewAudioMeterOutputChannelCount(outputChannels);
	const outputGain = audioContext.createGain();
	outputGain.gain.value = 1;
	outputGain.connect(audioContext.destination);
	const mix = audioContext.createGain();
	configurePreviewAudioOutputChannels(mix, outputChannelCount);
	mix.connect(outputGain);
	const combinedTap = createPreviewAudioMeterTapState({
		audioContext,
		channelCount: outputChannelCount,
		labels: createPreviewOutputChannelLabels(outputChannelCount),
		sourceNode: mix,
	});
	const tracks = resources.map((resource) => {
		const gainNode = audioContext.createGain();
		gainNode.gain.value = 0;
		gainNode.connect(mix);
		return {
			resource: { ...resource },
			gainNode,
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
				sampleRate: buffer.sampleRate,
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
		setOutputGain(gain: number) {
			outputGain.gain.value = clampPreviewVolume(gain);
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
		setTrackMonitorGain(index: number, gain: number) {
			const track = tracks[index];
			if (track) {
				track.monitorGain = clampPreviewVolume(gain);
				track.gainNode.gain.value = track.monitorGain * track.volumeGain;
			}
		},
		setTrackVolumeGain(index: number, gain: number) {
			const track = tracks[index];
			if (track) {
				track.volumeGain = clampPreviewVolume(gain);
				track.gainNode.gain.value = track.monitorGain * track.volumeGain;
			}
		},
		readMeterSnapshot(
			playing: boolean,
			failures: ReadonlyMap<string, string>,
		): PreviewAudioEngineMeterSnapshot {
			const trackStates: Record<string, PreviewAudioEngineTrackMeterState> = {};
			for (const track of tracks) {
				const reason =
					failures.get(track.resource.trackId) ??
					(track.meterTap.status === "unavailable"
						? track.meterTap.reason
						: null);
				trackStates[track.resource.trackId] = reason
					? { status: "unavailable", reason, trackId: track.resource.trackId }
					: {
							status: "ready",
							trackId: track.resource.trackId,
							channels:
								track.meterTap.status === "ready"
									? readPreviewAudioMeterTapChannels({
											playing,
											tap: track.meterTap.tap,
										})
									: [],
						};
			}
			const reasons = tracks
				.filter((t) => t.monitorGain > 0 && failures.has(t.resource.trackId))
				.map((t) => failures.get(t.resource.trackId));
			return {
				trackStates,
				combinedState:
					combinedTap.status === "unavailable"
						? combinedTap
						: {
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
			for (const track of tracks) {
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
	const resolvedChannelMode = resolvePreviewAudioChannelMode({
		audioBuffer: resource,
		channelMode,
	});

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

function resolvePreviewAudioChannelMode({
	channelMode,
}: {
	audioBuffer: Pick<AudioBuffer, "numberOfChannels">;
	channelMode: AudioTrackChannelMode;
}): Exclude<AudioTrackChannelMode, "auto-one-sided-stereo"> {
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
	const resolvedMode = resolvePreviewAudioChannelMode({
		audioBuffer: resource,
		channelMode,
	});
	const channelCount = normalizePreviewAudioMeterOutputChannelCount(
		audioMixPlanTrackOutputChannelCount({
			inputChannelCount: resource.numberOfChannels,
			resolvedChannelMode: resolvedMode,
		}),
	);

	return createPreviewAudioMeterTapState({
		audioContext,
		channelCount,
		labels: createPreviewAudioMeterChannelLabels({
			audioBuffer: resource,
			outputChannels: channelCount,
			resolvedMode,
		}),
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
			reason: `Preview audio engine meter tap unavailable: ${errorToMessage(error)}`,
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

function createPreviewAudioMeterChannelLabels({
	audioBuffer,
	outputChannels,
	resolvedMode,
}: {
	audioBuffer: Pick<AudioBuffer, "numberOfChannels">;
	outputChannels: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
}): string[] {
	if (
		resolvedMode === "use-left-as-mono" ||
		resolvedMode === "use-right-as-mono" ||
		resolvedMode === "average-to-mono"
	) {
		return outputChannels === 1
			? ["Mono"]
			: createPreviewOutputChannelLabels(outputChannels);
	}

	if (
		outputChannels === 2 &&
		(resolvedMode === "duplicate-left-to-stereo" ||
			resolvedMode === "duplicate-right-to-stereo")
	) {
		return ["Left", "Right"];
	}

	return Array.from({ length: outputChannels }, (_, channelIndex) =>
		formatPreviewAudioSourceChannelLabel(
			audioBuffer.numberOfChannels,
			channelIndex,
		),
	);
}

function formatPreviewAudioSourceChannelLabel(
	channelCount: number,
	channelIndex: number,
): string {
	if (channelCount === 1) {
		return "Mono";
	}

	if (channelCount === 2) {
		return channelIndex === 0 ? "Left" : "Right";
	}

	return `Ch ${channelIndex + 1}`;
}

function createPreviewOutputChannelLabels(outputChannels: number): string[] {
	if (outputChannels === 1) {
		return ["Mono"];
	}

	if (outputChannels === 2) {
		return ["Left", "Right"];
	}

	return Array.from(
		{ length: outputChannels },
		(_, channelIndex) => `Ch ${channelIndex + 1}`,
	);
}

function disconnectPreviewAudioNodes(nodes: PreviewAudioNodeLike[]) {
	for (const node of nodes) {
		node.disconnect?.();
	}
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function normalizePreviewAudioMeterOutputChannelCount(outputChannels: number) {
	if (!Number.isFinite(outputChannels)) {
		return 2;
	}

	return Math.max(1, Math.min(8, Math.round(outputChannels)));
}

function clampPreviewVolume(volume: number) {
	if (!Number.isFinite(volume)) {
		return 1;
	}

	return Math.max(0, Math.min(volume, 1));
}
