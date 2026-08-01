import {
	type AudioMixPlanTrack,
	audioMixPlanTrackOutputChannelCount,
	createAudioMixPlan,
} from "@/editor-core/audio-mix-plan";
import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "../types/preview-audio-resources.types";
import {
	type ResolvedChannelTransform,
	resolveChannelTransform,
} from "./browser-audio-mix";

export type PreviewAudioEngine = {
	destroy: () => void;
	getCurrentTime: () => number;
	getStatus: () => PreviewAudioEngineStatus;
	pause: () => void;
	play: () => Promise<void>;
	readMeterSnapshot: () => PreviewAudioEngineMeterSnapshot;
	retryTrackResource: (trackId: string) => Promise<PreviewAudioEngineStatus>;
	setOutputGain: (gain: number) => void;
	setPlaybackRate: (playbackRate: number) => void;
	setTime: (timeSeconds: number) => void;
	setTrackChannelMode: (
		trackIndex: number,
		channelMode: AudioTrackChannelMode,
	) => void;
	setTrackMonitorGain: (trackIndex: number, gain: number) => void;
	setTrackVolumeGain: (trackIndex: number, gain: number) => void;
};

export type PreviewAudioEngineStatus = "degraded" | "ready";

export type PreviewAudioEngineMeterChannel = {
	label: string;
	peak: number;
};

export type PreviewAudioEngineTrackMeterState =
	| {
			channels: PreviewAudioEngineMeterChannel[];
			status: "ready";
			trackId: string;
	  }
	| {
			reason: string;
			status: "unavailable";
			trackId: string;
	  };

export type PreviewAudioEngineCombinedMeterState =
	| {
			channels: PreviewAudioEngineMeterChannel[];
			partial: boolean;
			reason?: string;
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  };

export type PreviewAudioEngineMeterSnapshot = {
	combinedState: PreviewAudioEngineCombinedMeterState;
	trackStates: Record<string, PreviewAudioEngineTrackMeterState>;
};

export type PreviewAudioContextLike = {
	close?: () => Promise<void> | void;
	createAnalyser: () => PreviewAudioAnalyserNodeLike;
	createBufferSource: () => PreviewAudioBufferSourceNodeLike;
	createChannelMerger?: (numberOfInputs?: number) => PreviewAudioNodeLike;
	createChannelSplitter?: (numberOfOutputs?: number) => PreviewAudioNodeLike;
	createGain: () => PreviewAudioGainNodeLike;
	currentTime: number;
	decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
	destination: PreviewAudioNodeLike;
	resume?: () => Promise<void> | void;
	sampleRate: number;
};

export type PreviewAudioNodeLike = {
	channelCount?: number;
	channelCountMode?: "clamped-max" | "explicit" | "max";
	channelInterpretation?: "discrete" | "speakers";
	connect: (
		destination: PreviewAudioNodeLike,
		output?: number,
		input?: number,
	) => unknown;
	disconnect?: (destination?: PreviewAudioNodeLike) => void;
};

export type PreviewAudioAnalyserNodeLike = PreviewAudioNodeLike & {
	fftSize: number;
	getFloatTimeDomainData: (array: Float32Array) => void;
};

export type PreviewAudioGainNodeLike = PreviewAudioNodeLike & {
	gain: {
		value: number;
	};
};

export type PreviewAudioBufferSourceNodeLike = PreviewAudioNodeLike & {
	buffer: AudioBuffer | null;
	playbackRate: {
		value: number;
	};
	start: (when?: number, offset?: number) => void;
	stop: () => void;
};

export type CreatePreviewAudioEngineOptions = {
	createAudioContext?: () => PreviewAudioContextLike;
	failures?: PreviewAudioResourceFailure[];
	outputChannels: number;
	resources: PreviewAudioResource[];
};

type DecodedPreviewAudioResource = {
	buffer: AudioBuffer;
	source: PreviewAudioResource;
};

type PreviewAudioReadyResourceTrack = {
	resource: DecodedPreviewAudioResource;
	status: "ready";
	trackId: string;
	trackIndex: number;
};

type PreviewAudioPreparedTrack =
	| PreviewAudioReadyResourceTrack
	| PreviewAudioUnavailableEngineTrack;

type PreviewAudioReadyEngineTrack = {
	channelMode: AudioTrackChannelMode;
	channelRouting: PreviewAudioTrackChannelRouting;
	gainNode: PreviewAudioGainNodeLike;
	meterTap: PreviewAudioMeterTapState;
	monitorGain: number;
	resource: DecodedPreviewAudioResource;
	sourceNode: PreviewAudioBufferSourceNodeLike | null;
	status: "ready";
	trackId: string;
	trackIndex: number;
	trackVolumeGain: number;
};

type PreviewAudioUnavailableEngineTrack = {
	channelMode: AudioTrackChannelMode;
	monitorGain: number;
	reason: string;
	source?: PreviewAudioResource;
	status: "unavailable";
	trackId: string;
	trackIndex: number;
	trackVolumeGain: number;
};

type PreviewAudioEngineTrack =
	| PreviewAudioReadyEngineTrack
	| PreviewAudioUnavailableEngineTrack;

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

export function canUsePreviewAudioEngine(asset: ReadyMediaAsset) {
	return (
		asset.tracks.audio.length > 0 &&
		typeof window !== "undefined" &&
		typeof AudioContext !== "undefined" &&
		typeof Blob.prototype.arrayBuffer === "function" &&
		typeof URL.createObjectURL === "function"
	);
}

export async function createPreviewAudioEngine({
	createAudioContext = createDefaultPreviewAudioContext,
	failures = [],
	outputChannels,
	resources,
}: CreatePreviewAudioEngineOptions): Promise<PreviewAudioEngine> {
	const audioContext = createAudioContext();
	const decodedTracks = await Promise.all(
		resources.map((source) =>
			decodePreviewAudioEngineTrack({
				audioContext,
				source,
			}),
		),
	);
	const readyTrackCount = decodedTracks.filter(
		(track) => track.status === "ready",
	).length;

	if (readyTrackCount === 0) {
		await audioContext.close?.();
		throw new Error(
			createTotalPreviewAudioResourceFailureReason([
				...decodedTracks,
				...failures.map(createUnavailablePreviewAudioTrackFromFailure),
			]),
		);
	}

	return createPreparedPreviewAudioEngine({
		audioContext,
		outputChannels,
		tracks: [
			...decodedTracks,
			...failures.map(createUnavailablePreviewAudioTrackFromFailure),
		],
	});
}

export function previewTrackVolumeGainForAudioTrackResource({
	audioMix,
	resource,
}: {
	audioMix: AudioMix;
	resource: PreviewAudioResource;
}) {
	const plan = createAudioMixPlan({
		audioMix,
		trackIds: [resource.trackId],
	});

	return plan.tracksById[resource.trackId]?.trackVolumeGain ?? 1;
}

export function previewTrackMonitorGainForAudioTrackResource({
	audioMix,
	soloedAudioTrackId,
	resource,
}: {
	audioMix: AudioMix;
	soloedAudioTrackId?: string | null;
	resource: PreviewAudioResource;
}) {
	const plan = createAudioMixPlan({
		audioMix,
		trackIds: [resource.trackId],
	});
	const trackPlan = plan.tracksById[resource.trackId];

	return previewTrackMonitorGainForAudioMixPlanTrack({
		soloedAudioTrackId,
		trackPlan,
	});
}

export function previewOutputGainForAudioMonitoring({
	muted,
	volume,
}: {
	muted: boolean;
	volume: number;
}) {
	if (muted) {
		return 0;
	}

	return clampPreviewVolume(volume);
}

function previewTrackMonitorGainForAudioMixPlanTrack({
	soloedAudioTrackId,
	trackPlan,
}: {
	soloedAudioTrackId?: string | null;
	trackPlan: AudioMixPlanTrack | undefined;
}) {
	if (soloedAudioTrackId && trackPlan?.trackId !== soloedAudioTrackId) {
		return 0;
	}

	if (!soloedAudioTrackId && trackPlan?.include === false) {
		return 0;
	}

	return 1;
}

export function applyPreviewAudioEngineMix({
	audioMix,
	muted,
	previewAudioEngine,
	soloedAudioTrackId,
	resources,
	volume,
}: {
	audioMix: AudioMix;
	muted: boolean;
	previewAudioEngine: PreviewAudioEngine;
	soloedAudioTrackId?: string | null;
	resources: PreviewAudioResource[];
	volume: number;
}) {
	previewAudioEngine.setOutputGain(
		previewOutputGainForAudioMonitoring({ muted, volume }),
	);

	const mixPlan = createAudioMixPlan({
		audioMix,
		trackIds: resources.map((resource) => resource.trackId),
	});

	resources.forEach((resource, resourceIndex) => {
		const trackPlan = mixPlan.tracksById[resource.trackId];

		previewAudioEngine.setTrackChannelMode(
			resourceIndex,
			trackPlan?.channelMode ?? "preserve",
		);
		previewAudioEngine.setTrackVolumeGain(
			resourceIndex,
			trackPlan?.trackVolumeGain ?? 1,
		);
		previewAudioEngine.setTrackMonitorGain(
			resourceIndex,
			previewTrackMonitorGainForAudioMixPlanTrack({
				soloedAudioTrackId,
				trackPlan,
			}),
		);
	});
}

export function setPreviewAudioEnginePlaybackRate(
	previewAudioEngine: PreviewAudioEngine | null,
	playbackRate: number,
) {
	previewAudioEngine?.setPlaybackRate(playbackRate);
}

function createPreparedPreviewAudioEngine({
	audioContext,
	outputChannels,
	tracks: preparedTracks,
}: {
	audioContext: PreviewAudioContextLike;
	outputChannels: number;
	tracks: PreviewAudioPreparedTrack[];
}): PreviewAudioEngine {
	const outputChannelCount =
		normalizePreviewAudioMeterOutputChannelCount(outputChannels);
	const outputGainNode = audioContext.createGain();
	outputGainNode.gain.value = 1;
	outputGainNode.connect(audioContext.destination);
	const monitoredMixNode = audioContext.createGain();
	configurePreviewAudioOutputChannels(monitoredMixNode, outputChannelCount);
	monitoredMixNode.connect(outputGainNode);
	const combinedMeterTap = createPreviewAudioMeterTapState({
		audioContext,
		channelCount: outputChannelCount,
		labels: createPreviewOutputChannelLabels(outputChannelCount),
		sourceNode: monitoredMixNode,
	});

	const tracks: PreviewAudioEngineTrack[] = preparedTracks.map((track) => {
		if (track.status === "unavailable") {
			return track;
		}

		const gainNode = audioContext.createGain();
		gainNode.gain.value = 0;
		gainNode.connect(monitoredMixNode);
		const channelMode = "preserve";

		return {
			channelMode,
			channelRouting: createPreviewAudioTrackChannelRouting({
				audioContext,
				channelMode,
				gainNode,
				resource: track.resource,
			}),
			gainNode,
			meterTap: createPreviewAudioTrackMeterTapState({
				audioContext,
				channelMode,
				gainNode,
				resource: track.resource,
			}),
			monitorGain: 0,
			resource: track.resource,
			sourceNode: null,
			status: "ready",
			trackId: track.trackId,
			trackIndex: track.trackIndex,
			trackVolumeGain: 1,
		};
	});
	let currentTimeSeconds = 0;
	let destroyed = false;
	let playing = false;
	let playbackRate = 1;
	let playbackStartContextTimeSeconds = audioContext.currentTime;
	let playbackStartMediaTimeSeconds = 0;

	function getCurrentTime() {
		if (!playing) {
			return currentTimeSeconds;
		}

		return Math.max(
			0,
			playbackStartMediaTimeSeconds +
				(audioContext.currentTime - playbackStartContextTimeSeconds) *
					playbackRate,
		);
	}

	function syncCurrentTimeFromContext() {
		currentTimeSeconds = getCurrentTime();
		playbackStartContextTimeSeconds = audioContext.currentTime;
		playbackStartMediaTimeSeconds = currentTimeSeconds;
	}

	function stopTrackSources() {
		for (const track of tracks) {
			if (track.status !== "ready") {
				continue;
			}

			if (!track.sourceNode) {
				continue;
			}

			try {
				track.sourceNode.stop();
			} catch {
				// A Web Audio source can only be stopped after it has started.
			}

			track.sourceNode.disconnect?.();
			track.sourceNode = null;
		}
	}

	function startTrackSources() {
		stopTrackSources();
		playbackStartContextTimeSeconds = audioContext.currentTime;
		playbackStartMediaTimeSeconds = currentTimeSeconds;

		for (const track of tracks) {
			if (track.status !== "ready") {
				continue;
			}

			const sourceNode = audioContext.createBufferSource();
			const trackStartSeconds = track.resource.source.startPositionSeconds;
			const offsetSeconds = currentTimeSeconds - trackStartSeconds;
			const startOffsetSeconds = Math.max(0, offsetSeconds);

			if (startOffsetSeconds >= track.resource.buffer.duration) {
				continue;
			}

			sourceNode.buffer = track.resource.buffer;
			sourceNode.playbackRate.value = playbackRate;
			sourceNode.connect(track.channelRouting.inputNode);

			const startDelaySeconds =
				offsetSeconds < 0 ? Math.abs(offsetSeconds) / playbackRate : 0;
			sourceNode.start(
				audioContext.currentTime + startDelaySeconds,
				startOffsetSeconds,
			);
			track.sourceNode = sourceNode;
		}
	}

	function readMeterSnapshot(): PreviewAudioEngineMeterSnapshot {
		const trackStates: Record<string, PreviewAudioEngineTrackMeterState> = {};

		for (const track of tracks) {
			if (track.status !== "ready") {
				trackStates[track.trackId] = {
					reason: track.reason,
					status: "unavailable",
					trackId: track.trackId,
				};

				continue;
			}

			if (track.meterTap.status === "unavailable") {
				trackStates[track.trackId] = {
					reason: track.meterTap.reason,
					status: "unavailable",
					trackId: track.trackId,
				};
				continue;
			}

			trackStates[track.trackId] = {
				channels: readPreviewAudioMeterTapChannels({
					playing,
					tap: track.meterTap.tap,
				}),
				status: "ready",
				trackId: track.trackId,
			};
		}

		const unavailableReasons = createPreviewAudioUnavailableReasons(
			tracks.filter(
				(track) => track.status === "unavailable" && track.monitorGain > 0,
			),
		);
		const combinedState: PreviewAudioEngineCombinedMeterState =
			combinedMeterTap.status === "unavailable"
				? combinedMeterTap
				: {
						channels: readPreviewAudioMeterTapChannels({
							playing,
							tap: combinedMeterTap.tap,
						}),
						partial: unavailableReasons.length > 0,
						reason:
							unavailableReasons.length > 0
								? `Some monitored tracks are unavailable: ${unavailableReasons.join(", ")}`
								: undefined,
						status: "ready",
					};

		return {
			combinedState,
			trackStates,
		};
	}

	return {
		destroy() {
			if (destroyed) {
				return;
			}

			destroyed = true;
			playing = false;
			stopTrackSources();

			for (const track of tracks) {
				if (track.status !== "ready") {
					continue;
				}

				track.channelRouting.dispose();
				disposePreviewAudioMeterTapState(track.meterTap);
				track.gainNode.disconnect?.();
			}

			disposePreviewAudioMeterTapState(combinedMeterTap);
			monitoredMixNode.disconnect?.();
			outputGainNode.disconnect?.();
			void audioContext.close?.();
		},
		getCurrentTime,
		getStatus() {
			return getPreviewAudioEngineStatus(tracks);
		},
		pause() {
			if (destroyed || !playing) {
				return;
			}

			syncCurrentTimeFromContext();
			playing = false;
			stopTrackSources();
		},
		async play() {
			if (destroyed || playing) {
				return;
			}

			await audioContext.resume?.();

			if (destroyed || playing) {
				return;
			}

			playing = true;
			startTrackSources();
		},
		readMeterSnapshot,
		async retryTrackResource(trackId: string) {
			if (destroyed) {
				return getPreviewAudioEngineStatus(tracks);
			}

			const trackIndex = tracks.findIndex(
				(track) => track.status === "unavailable" && track.trackId === trackId,
			);
			const track = tracks[trackIndex];

			if (!track || track.status !== "unavailable" || !track.source) {
				return getPreviewAudioEngineStatus(tracks);
			}

			const wasPlaying = playing;

			if (wasPlaying) {
				syncCurrentTimeFromContext();
				playing = false;
				stopTrackSources();
			}

			try {
				const buffer = await decodePreviewAudioResource(
					audioContext,
					track.source,
				);

				if (destroyed) {
					return getPreviewAudioEngineStatus(tracks);
				}

				const resource = {
					buffer,
					source: track.source,
				};
				const gainNode = audioContext.createGain();
				gainNode.gain.value = 0;
				gainNode.connect(monitoredMixNode);
				const readyTrack: PreviewAudioReadyEngineTrack = {
					channelMode: track.channelMode,
					channelRouting: createPreviewAudioTrackChannelRouting({
						audioContext,
						channelMode: track.channelMode,
						gainNode,
						resource,
					}),
					gainNode,
					meterTap: createPreviewAudioTrackMeterTapState({
						audioContext,
						channelMode: track.channelMode,
						gainNode,
						resource,
					}),
					monitorGain: track.monitorGain,
					resource,
					sourceNode: null,
					status: "ready",
					trackId: track.trackId,
					trackIndex: track.trackIndex,
					trackVolumeGain: track.trackVolumeGain,
				};

				updatePreviewAudioTrackGainNode(readyTrack);
				tracks[trackIndex] = readyTrack;
			} catch (error) {
				if (destroyed) {
					return getPreviewAudioEngineStatus(tracks);
				}

				tracks[trackIndex] = {
					...track,
					reason: errorToMessage(error),
				};
			}

			if (wasPlaying && !destroyed) {
				playing = true;
				startTrackSources();
			}

			return getPreviewAudioEngineStatus(tracks);
		},
		setPlaybackRate(nextPlaybackRate: number) {
			if (!playing) {
				playbackRate = clampPlaybackRate(nextPlaybackRate);
				return;
			}

			syncCurrentTimeFromContext();
			playbackRate = clampPlaybackRate(nextPlaybackRate);
			startTrackSources();
		},
		setOutputGain(gain: number) {
			outputGainNode.gain.value = clampPreviewVolume(gain);
		},
		setTime(nextTimeSeconds: number) {
			currentTimeSeconds = clampPreviewTime(nextTimeSeconds);

			if (!playing) {
				return;
			}

			startTrackSources();
		},
		setTrackChannelMode(
			trackIndex: number,
			channelMode: AudioTrackChannelMode,
		) {
			const track = tracks[trackIndex];

			if (!track || track.channelMode === channelMode) {
				return;
			}

			if (track.status === "unavailable") {
				track.channelMode = channelMode;
				return;
			}

			if (playing) {
				syncCurrentTimeFromContext();
				stopTrackSources();
			}

			track.channelMode = channelMode;
			disposePreviewAudioMeterTapState(track.meterTap);
			track.channelRouting.dispose();
			track.channelRouting = createPreviewAudioTrackChannelRouting({
				audioContext,
				channelMode,
				gainNode: track.gainNode,
				resource: track.resource,
			});
			track.meterTap = createPreviewAudioTrackMeterTapState({
				audioContext,
				channelMode,
				gainNode: track.gainNode,
				resource: track.resource,
			});

			if (playing) {
				startTrackSources();
			}
		},
		setTrackMonitorGain(trackIndex: number, gain: number) {
			const track = tracks[trackIndex];

			if (!track) {
				return;
			}

			track.monitorGain = clampPreviewVolume(gain);
			if (track.status === "ready") {
				updatePreviewAudioTrackGainNode(track);
			}
		},
		setTrackVolumeGain(trackIndex: number, gain: number) {
			const track = tracks[trackIndex];

			if (!track) {
				return;
			}

			track.trackVolumeGain = clampPreviewVolume(gain);
			if (track.status === "ready") {
				updatePreviewAudioTrackGainNode(track);
			}
		},
	};
}

function updatePreviewAudioTrackGainNode(track: PreviewAudioReadyEngineTrack) {
	track.gainNode.gain.value =
		clampPreviewVolume(track.trackVolumeGain) *
		clampPreviewVolume(track.monitorGain);
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
	resource: DecodedPreviewAudioResource;
}): PreviewAudioTrackChannelRouting {
	const resolvedChannelMode = resolvePreviewAudioChannelMode({
		audioBuffer: resource.buffer,
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
		Math.max(1, resource.buffer.numberOfChannels),
	);
	const createdNodes: PreviewAudioNodeLike[] = [splitter];

	if (
		resolvedChannelMode === "use-left-as-mono" ||
		resolvedChannelMode === "use-right-as-mono"
	) {
		const sourceChannelIndex = sourceChannelIndexForMode(
			resolvedChannelMode,
			resource.buffer,
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
			resource.buffer,
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
				inputChannelCount: resource.buffer.numberOfChannels,
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
			channelIndex < resource.buffer.numberOfChannels;
			channelIndex += 1
		) {
			const averageGainNode = audioContext.createGain();
			averageGainNode.gain.value =
				1 / Math.max(1, resource.buffer.numberOfChannels);
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
	audioBuffer,
	channelMode,
}: {
	audioBuffer: AudioBuffer;
	channelMode: AudioTrackChannelMode;
}): Exclude<AudioTrackChannelMode, "auto-one-sided-stereo"> {
	if (channelMode === "auto-one-sided-stereo") {
		return resolveChannelTransform(audioBuffer, channelMode).resolvedMode;
	}

	return channelMode;
}

function sourceChannelIndexForMode(
	channelMode: ResolvedChannelTransform["resolvedMode"],
	audioBuffer: AudioBuffer,
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
	resource: DecodedPreviewAudioResource;
}): PreviewAudioMeterTapState {
	const resolvedMode = resolvePreviewAudioChannelMode({
		audioBuffer: resource.buffer,
		channelMode,
	});
	const channelCount = normalizePreviewAudioMeterOutputChannelCount(
		audioMixPlanTrackOutputChannelCount({
			inputChannelCount: resource.buffer.numberOfChannels,
			resolvedChannelMode: resolvedMode,
		}),
	);

	return createPreviewAudioMeterTapState({
		audioContext,
		channelCount,
		labels: createPreviewAudioMeterChannelLabels({
			audioBuffer: resource.buffer,
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
	audioBuffer: AudioBuffer;
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

async function decodePreviewAudioEngineTrack({
	audioContext,
	source,
}: {
	audioContext: PreviewAudioContextLike;
	source: PreviewAudioResource;
}): Promise<PreviewAudioPreparedTrack> {
	try {
		return {
			resource: {
				buffer: await decodePreviewAudioResource(audioContext, source),
				source,
			},
			status: "ready",
			trackId: source.trackId,
			trackIndex: source.trackIndex,
		};
	} catch (error) {
		return createUnavailablePreviewAudioTrackFromSource({
			reason: errorToMessage(error),
			source,
		});
	}
}

function createUnavailablePreviewAudioTrackFromSource({
	reason,
	source,
}: {
	reason: string;
	source: PreviewAudioResource;
}): PreviewAudioUnavailableEngineTrack {
	return {
		channelMode: "preserve",
		monitorGain: 0,
		reason,
		source,
		status: "unavailable",
		trackId: source.trackId,
		trackIndex: source.trackIndex,
		trackVolumeGain: 1,
	};
}

function createUnavailablePreviewAudioTrackFromFailure(
	failure: PreviewAudioResourceFailure,
): PreviewAudioUnavailableEngineTrack {
	return {
		channelMode: "preserve",
		monitorGain: 0,
		reason: failure.reason,
		status: "unavailable",
		trackId: failure.trackId,
		trackIndex: failure.trackIndex,
		trackVolumeGain: 1,
	};
}

function getPreviewAudioEngineStatus(
	tracks: PreviewAudioEngineTrack[],
): PreviewAudioEngineStatus {
	return tracks.some((track) => track.status === "unavailable")
		? "degraded"
		: "ready";
}

function createPreviewAudioUnavailableReasons(
	tracks: Array<PreviewAudioEngineTrack | PreviewAudioPreparedTrack>,
) {
	return tracks.flatMap((track) =>
		track.status === "unavailable" ? [track.reason] : [],
	);
}

function createTotalPreviewAudioResourceFailureReason(
	tracks: PreviewAudioPreparedTrack[],
) {
	const reasons = createPreviewAudioUnavailableReasons(tracks);

	if (reasons.length === 0) {
		return "No Preview audio resources could be prepared.";
	}

	return `No Preview audio resources could be prepared: ${reasons.join(", ")}`;
}

async function decodePreviewAudioResource(
	audioContext: PreviewAudioContextLike,
	source: PreviewAudioResource,
) {
	const audioData = await source.blob.arrayBuffer();

	return audioContext.decodeAudioData(audioData.slice(0));
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function createDefaultPreviewAudioContext(): PreviewAudioContextLike {
	return new AudioContext() as unknown as PreviewAudioContextLike;
}

function clampPlaybackRate(playbackRate: number) {
	if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
		return 1;
	}

	return playbackRate;
}

function clampPreviewTime(timeSeconds: number) {
	if (!Number.isFinite(timeSeconds)) {
		return 0;
	}

	return Math.max(0, timeSeconds);
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
