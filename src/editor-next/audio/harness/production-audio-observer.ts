import type { MediaWindowProvider } from "../engine/media-window-provider";
import type { PreviewAudioContextLike } from "../engine/preview-audio-engine";

/** Wraps public ownership calls; never reads decoder internals or retains PCM. */
export function observeProductionProvider(source: MediaWindowProvider) {
	const metrics = {
		generationsOpened: 0,
		generationsCancelled: 0,
		activeGenerations: 0,
		pulls: 0,
		publishedChunks: 0,
		publishedPcmBytes: 0,
		publishedMediaSeconds: 0,
		disposalsCompleted: 0,
		initialTrackStates: {} as Record<string, string>,
	};
	const active = new Set<number>();
	let failTrackOnce: string | null = null;
	const provider: MediaWindowProvider = {
		getTrackMetadata: (trackId) => source.getTrackMetadata(trackId),
		durationSeconds: source.durationSeconds,
		trackIds: source.trackIds,
		async dispose() {
			await source.dispose();
			metrics.disposalsCompleted++;
			active.clear();
			metrics.activeGenerations = 0;
		},
		openGeneration(options) {
			const generation = source.openGeneration(options);
			metrics.generationsOpened++;
			active.add(generation.id);
			metrics.activeGenerations = active.size;
			return {
				id: generation.id,
				startSeconds: generation.startSeconds,
				trackIds: generation.trackIds,
				async cancel() {
					await generation.cancel();
					if (active.delete(generation.id)) metrics.generationsCancelled++;
					metrics.activeGenerations = active.size;
				},
				async pullThrough(endSeconds) {
					const result = await generation.pullThrough(endSeconds);
					metrics.pulls++;
					for (const track of result.tracks) {
						metrics.initialTrackStates[track.trackId] ??= track.kind;
						if (track.kind === "playable") {
							for (const chunk of track.chunks) {
								metrics.publishedChunks++;
								metrics.publishedPcmBytes +=
									chunk.audioBuffer.length *
									chunk.audioBuffer.numberOfChannels *
									4;
								metrics.publishedMediaSeconds +=
									chunk.endSeconds - chunk.startSeconds;
							}
						}
					}
					const failedTrack = failTrackOnce;
					if (
						failedTrack &&
						result.tracks.some((track) => track.trackId === failedTrack)
					) {
						failTrackOnce = null;
						return {
							...result,
							tracks: result.tracks.map((track) =>
								track.trackId === failedTrack
									? {
											trackId: track.trackId,
											startSeconds: track.startSeconds,
											endSeconds: track.endSeconds,
											kind: "failure" as const,
											state: "failure" as const,
											reason: "Harness-injected per-track failure",
										}
									: track,
							),
						};
					}
					return result;
				},
			};
		},
	};
	return {
		provider,
		getMetrics: () => structuredClone(metrics),
		failNextPullForTrack(trackId: string) {
			failTrackOnce = trackId;
		},
	};
}

/** Independently observes source disconnect and awaited context close. */
export function observeProductionContext() {
	const context = new AudioContext();
	const sources = new Set<AudioBufferSourceNode>();
	let created = 0;
	let disconnected = 0;
	let contextsClosed = 0;
	const createSource = context.createBufferSource.bind(context);
	context.createBufferSource = () => {
		const source = createSource();
		created++;
		sources.add(source);
		const disconnect = source.disconnect.bind(source);
		source.disconnect = () => {
			disconnect();
			if (sources.delete(source)) disconnected++;
		};
		return source;
	};
	const close = context.close.bind(context);
	let closing: Promise<void> | null = null;
	context.close = () => {
		closing ??= close().then(() => {
			contextsClosed++;
		});
		return closing;
	};
	return {
		context,
		createAudioContext: () => context as unknown as PreviewAudioContextLike,
		async waitForClose() {
			await closing;
		},
		getMetrics: () => ({
			contextsClosed,
			contextState: context.state,
			sourcesCreated: created,
			sourcesDisconnected: disconnected,
			residualSources: sources.size,
		}),
	};
}
