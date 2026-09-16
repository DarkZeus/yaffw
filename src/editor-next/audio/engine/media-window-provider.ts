import {
	ALL_FORMATS,
	type AudioSample,
	AudioSampleSink,
	BlobSource,
	type EncodedPacket,
	EncodedPacketSink,
	Input,
	type InputAudioTrack,
} from "mediabunny";

const DEFAULT_BATCH_DURATION_SECONDS = 0.2;
const MAX_BATCH_DURATION_SECONDS = 0.2;

export type MediaWindowChunk = {
	audioBuffer: AudioBuffer;
	endSeconds: number;
	startSeconds: number;
	trackId: string;
};

export type MediaWindowPlayableTrackState = {
	chunks: readonly MediaWindowChunk[];
	endSeconds: number;
	kind: "playable";
	startSeconds: number;
	state: "playable";
	trackId: string;
};

export type MediaWindowSilentTrackState = {
	endSeconds: number;
	kind: "silence";
	startSeconds: number;
	state: "silence";
	trackId: string;
};

export type MediaWindowFailedTrackState = {
	endSeconds: number;
	kind: "failure";
	reason: string;
	startSeconds: number;
	state: "failure";
	trackId: string;
};

export type MediaWindowTrackState =
	| MediaWindowPlayableTrackState
	| MediaWindowSilentTrackState
	| MediaWindowFailedTrackState;

export type MediaWindowPullResult = {
	endSeconds: number;
	generationId: number;
	startSeconds: number;
	tracks: readonly MediaWindowTrackState[];
};

export type MediaWindowTrackMetadata = {
	failureReason: string | null;
	numberOfChannels: number;
	sampleRate: number;
};

export type OpenMediaWindowGenerationOptions = {
	retryTrackIds?: ReadonlySet<string> | readonly string[];
	signal: AbortSignal;
	startSeconds: number;
	trackIds?: ReadonlySet<string> | readonly string[];
};

export type MediaWindowGeneration = {
	cancel: () => Promise<void>;
	readonly id: number;
	pullThrough: (endSeconds: number) => Promise<MediaWindowPullResult>;
	readonly startSeconds: number;
	readonly trackIds: readonly string[];
};

export type MediaWindowProvider = {
	getTrackMetadata: (trackId: string) => MediaWindowTrackMetadata;
	dispose: () => Promise<void>;
	readonly durationSeconds: number;
	openGeneration: (
		options: OpenMediaWindowGenerationOptions,
	) => MediaWindowGeneration;
	readonly trackIds: readonly string[];
};

export type CreateMediaWindowProviderOptions = {
	batchDurationSeconds?: number;
	durationSeconds?: number;
	signal?: AbortSignal;
	tracks?: readonly { id: string; channels?: number; sampleRate?: number }[];
	source: Blob;
};

type TrackDescriptor = {
	failureReason: string | null;
	firstTimestampSeconds: number;
	format: {
		numberOfChannels: number;
		sampleRate: number;
	};
	track: InputAudioTrack | null;
	trackIndex: number;
	trackEndSeconds: number;
	trackId: string;
};

type PacketRange = {
	endSeconds: number;
	startSeconds: number;
};

type PcmSegment = {
	channels: Float32Array[];
	endSeconds: number;
	sampleRate: number;
	startSeconds: number;
};

export async function createMediaWindowProvider({
	batchDurationSeconds = DEFAULT_BATCH_DURATION_SECONDS,
	durationSeconds,
	signal,
	source,
	tracks: assetTracks,
}: CreateMediaWindowProviderOptions): Promise<MediaWindowProvider> {
	validateBatchDuration(batchDurationSeconds);
	if (signal?.aborted) throw createAbortError();
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	let inputDisposed = false;
	const disposeInput = () => {
		if (inputDisposed) return;
		inputDisposed = true;
		input.dispose();
	};
	signal?.addEventListener("abort", disposeInput, { once: true });
	try {
		const tracks = await input.getAudioTracks();
		const identities =
			assetTracks ?? tracks.map((track) => ({ id: String(track.id) }));
		const descriptors = await Promise.all(
			identities.map((identity, index) =>
				describeTrack(
					tracks[index] ?? null,
					identity.id,
					index,
					assetTracks?.[index] ?? {},
				),
			),
		);
		if (signal?.aborted) throw createAbortError();
		return new MediabunnyMediaWindowProvider(
			input,
			descriptors,
			batchDurationSeconds,
			durationSeconds,
			disposeInput,
		);
	} catch (error) {
		disposeInput();
		throw error;
	} finally {
		signal?.removeEventListener("abort", disposeInput);
	}
}

class MediabunnyMediaWindowProvider implements MediaWindowProvider {
	readonly durationSeconds: number;
	readonly trackIds: readonly string[];

	private readonly activeGenerations =
		new Set<MediabunnyMediaWindowGeneration>();
	private disposed = false;
	private disposal: Promise<void> | null = null;
	private generationSequence = 0;

	constructor(
		private readonly input: Input,
		private readonly descriptors: readonly TrackDescriptor[],
		private readonly batchDurationSeconds: number,
		durationSeconds: number | undefined,
		private readonly disposeInput: () => void,
	) {
		this.trackIds = descriptors.map((descriptor) => descriptor.trackId);
		this.durationSeconds =
			durationSeconds ??
			descriptors.reduce(
				(maximum, descriptor) => Math.max(maximum, descriptor.trackEndSeconds),
				0,
			);
	}

	getTrackMetadata(trackId: string): MediaWindowTrackMetadata {
		const descriptor = this.descriptors.find(
			(track) => track.trackId === trackId,
		);
		if (!descriptor) throw new Error(`Unknown audio track: ${trackId}.`);
		return { ...descriptor.format, failureReason: descriptor.failureReason };
	}

	openGeneration({
		retryTrackIds,
		signal,
		startSeconds,
		trackIds,
	}: OpenMediaWindowGenerationOptions): MediaWindowGeneration {
		if (this.disposed) {
			throw new Error("Cannot open a generation on a disposed media provider.");
		}
		validateTimestamp(startSeconds, "startSeconds");

		const selectedTrackIds = normalizeTrackIds(trackIds, this.trackIds);
		const selectedTrackIdSet = new Set(selectedTrackIds);
		const selectedDescriptors = this.descriptors.filter((descriptor) =>
			selectedTrackIdSet.has(descriptor.trackId),
		);
		const previousCancellation = Promise.all(
			[...this.activeGenerations].map((generation) =>
				generation.cancelTracks(selectedTrackIdSet),
			),
		).then(async () => {
			if (this.disposed || signal.aborted) return;
			const retries = new Set(retryTrackIds);
			await Promise.all(
				selectedDescriptors
					.filter(
						(descriptor) =>
							retries.has(descriptor.trackId) && descriptor.failureReason,
					)
					.map(async (descriptor) => {
						try {
							const track =
								descriptor.track ??
								(await this.input.getAudioTracks())[descriptor.trackIndex] ??
								null;
							const updated = await describeTrack(
								track,
								descriptor.trackId,
								descriptor.trackIndex,
								{
									channels: descriptor.format.numberOfChannels,
									sampleRate: descriptor.format.sampleRate,
								},
							);
							if (!this.disposed && !signal.aborted)
								Object.assign(descriptor, updated);
						} catch (error) {
							if (!this.disposed && !signal.aborted)
								descriptor.failureReason = errorToMessage(error);
						}
					}),
			);
		});
		const generation = new MediabunnyMediaWindowGeneration({
			batchDurationSeconds: this.batchDurationSeconds,
			descriptors: selectedDescriptors,
			id: ++this.generationSequence,
			onCancel: () => {
				this.activeGenerations.delete(generation);
			},
			previousCancellation,
			signal,
			startSeconds,
		});

		this.activeGenerations.add(generation);
		return generation;
	}

	dispose(): Promise<void> {
		if (this.disposal) return this.disposal;
		this.disposed = true;
		this.disposal = Promise.allSettled(
			[...this.activeGenerations].map((generation) => generation.cancel()),
		).then((results) => {
			this.activeGenerations.clear();
			this.disposeInput();
			const errors = results.flatMap((result) =>
				result.status === "rejected" ? [result.reason] : [],
			);
			if (errors.length)
				throw new AggregateError(errors, "Audio generation cleanup failed.");
		});
		return this.disposal;
	}
}

class MediabunnyMediaWindowGeneration implements MediaWindowGeneration {
	private readonly cursors = new Map<string, TrackWindowCursor>();
	private readonly pendingCancellations = new Set<Promise<void>>();
	private readonly onAbort: () => void;
	private cancelPromise: Promise<void> | null = null;
	private cancelled = false;
	private coveredThroughSeconds: number;
	private pullQueue: Promise<void>;

	constructor(
		private readonly options: {
			batchDurationSeconds: number;
			descriptors: readonly TrackDescriptor[];
			id: number;
			onCancel: () => void;
			previousCancellation: Promise<void>;
			signal: AbortSignal;
			startSeconds: number;
		},
	) {
		this.coveredThroughSeconds = options.startSeconds;
		this.pullQueue = options.previousCancellation;
		for (const descriptor of options.descriptors) {
			this.cursors.set(
				descriptor.trackId,
				new TrackWindowCursor(
					descriptor,
					options.startSeconds,
					options.batchDurationSeconds,
				),
			);
		}
		this.onAbort = () => {
			void this.cancel().catch(reportGenerationCleanupFailure);
		};
		options.signal.addEventListener("abort", this.onAbort, { once: true });

		if (options.signal.aborted) {
			void this.cancel().catch(reportGenerationCleanupFailure);
		}
	}

	get id() {
		return this.options.id;
	}

	get startSeconds() {
		return this.options.startSeconds;
	}

	get trackIds() {
		return [...this.cursors.keys()];
	}

	pullThrough(endSeconds: number): Promise<MediaWindowPullResult> {
		const queuedPull = this.pullQueue.then(async () => {
			this.throwIfCancelled();
			validateTimestamp(endSeconds, "endSeconds");
			if (endSeconds <= this.coveredThroughSeconds) {
				throw new RangeError(
					`Window end ${endSeconds} must be after ${this.coveredThroughSeconds}.`,
				);
			}

			const startSeconds = this.coveredThroughSeconds;
			const trackResults = await Promise.all(
				[...this.cursors.values()].map((cursor) =>
					cursor.pull({
						endSeconds,
						isGenerationCancelled: () => this.isCancelled(),
						startSeconds,
					}),
				),
			);
			this.throwIfCancelled();
			const tracks = trackResults.filter(isMediaWindowTrackState);
			this.coveredThroughSeconds = endSeconds;

			return {
				endSeconds,
				generationId: this.id,
				startSeconds,
				tracks,
			};
		});

		this.pullQueue = queuedPull.then(
			() => undefined,
			() => undefined,
		);
		return queuedPull;
	}

	cancel(): Promise<void> {
		if (this.cancelPromise) {
			return this.cancelPromise;
		}

		this.cancelled = true;
		this.options.signal.removeEventListener("abort", this.onAbort);
		this.cancelPromise = settleCleanup([
			...this.pendingCancellations,
			...[...this.cursors.values()].map((cursor) => cursor.cancel()),
			this.pullQueue,
		]).finally(() => this.options.onCancel());
		this.cursors.clear();

		return this.cancelPromise;
	}

	async cancelTracks(trackIds: ReadonlySet<string>) {
		if (this.cancelled) {
			await this.cancelPromise;
			return;
		}

		const cancellations: Promise<void>[] = [];
		for (const trackId of trackIds) {
			const cursor = this.cursors.get(trackId);
			if (!cursor) {
				continue;
			}

			this.cursors.delete(trackId);
			const cancellation = cursor.cancel();
			this.pendingCancellations.add(cancellation);
			void cancellation.then(
				() => this.pendingCancellations.delete(cancellation),
				() => this.pendingCancellations.delete(cancellation),
			);
			cancellations.push(cancellation);
		}

		if (this.cursors.size === 0) {
			cancellations.push(this.cancel());
		}

		await settleCleanup(cancellations);
	}

	private isCancelled() {
		return this.cancelled || this.options.signal.aborted;
	}

	private throwIfCancelled() {
		if (this.isCancelled()) {
			throw createAbortError();
		}
	}
}

class TrackWindowCursor {
	private cancelled = false;
	private decodedThroughSeconds: number;
	private failureReason: string | null;
	private iterator: AsyncGenerator<AudioSample, void, unknown> | null = null;
	private iteratorEnded = false;
	private packetCursor: EncodedPacket | null = null;
	private packetCursorInitialized = false;
	private readonly packetRanges: PacketRange[] = [];
	private packetSink: EncodedPacketSink | null = null;
	private cancelPromise: Promise<void> | null = null;
	private initialized = false;
	private activePull: Promise<MediaWindowTrackState | null> | null = null;
	private readonly pcmSegments: PcmSegment[] = [];
	private projectedGapSeconds = 0;
	private projectedThroughGapEndSeconds = Number.NEGATIVE_INFINITY;
	private timestampProjectionCalibrated = false;

	constructor(
		private readonly descriptor: TrackDescriptor,
		private readonly generationStartSeconds: number,
		private readonly batchDurationSeconds: number,
	) {
		this.decodedThroughSeconds = generationStartSeconds;
		this.failureReason = descriptor.failureReason;
	}

	pull(options: {
		endSeconds: number;
		isGenerationCancelled: () => boolean;
		startSeconds: number;
	}): Promise<MediaWindowTrackState | null> {
		const promise = this.pullWindow(options);
		this.activePull = promise;
		const releasePull = () => {
			if (this.activePull === promise) this.activePull = null;
		};
		void promise.then(releasePull, releasePull);
		return promise;
	}

	private async pullWindow({
		endSeconds,
		isGenerationCancelled,
		startSeconds,
	}: {
		endSeconds: number;
		isGenerationCancelled: () => boolean;
		startSeconds: number;
	}): Promise<MediaWindowTrackState | null> {
		if (this.cancelled) {
			return null;
		}
		if (!this.initialized) {
			this.initialized = true;
			this.failureReason = this.descriptor.failureReason;
		}
		if (this.failureReason) {
			return this.createFailure(startSeconds, endSeconds);
		}

		try {
			if (!this.descriptor.track)
				throw new Error("The analyzed audio track is no longer available.");
			this.packetSink ??= new EncodedPacketSink(this.descriptor.track);
			await this.scanPacketsThrough(endSeconds, isGenerationCancelled);
			this.throwIfUnavailable(isGenerationCancelled);
			const occupiedRanges = intersectRanges(
				this.packetRanges,
				startSeconds,
				endSeconds,
			);

			if (occupiedRanges.length === 0) {
				consumeSegmentsThrough(this.pcmSegments, endSeconds);
				this.prunePacketRanges(endSeconds);
				return {
					endSeconds,
					kind: "silence",
					startSeconds,
					state: "silence",
					trackId: this.descriptor.trackId,
				};
			}

			const requiredDecodedThrough = occupiedRanges.reduce(
				(maximum, range) => Math.max(maximum, range.endSeconds),
				startSeconds,
			);
			await this.decodeThrough(requiredDecodedThrough, isGenerationCancelled);
			this.throwIfUnavailable(isGenerationCancelled);

			const chunks = this.consumeChunks(
				startSeconds,
				endSeconds,
				occupiedRanges,
			);
			if (chunks.length === 0) {
				this.failureReason =
					"The audio track decoded no presentable samples for an encoded window.";
				await this.releaseIterator();
				this.pcmSegments.length = 0;
				this.prunePacketRanges(endSeconds);
				return this.createFailure(startSeconds, endSeconds);
			}
			this.prunePacketRanges(endSeconds);

			return {
				chunks,
				endSeconds,
				kind: "playable",
				startSeconds,
				state: "playable",
				trackId: this.descriptor.trackId,
			};
		} catch (error) {
			if (this.cancelled && !isGenerationCancelled()) {
				return null;
			}
			if (isGenerationCancelled() || isAbortError(error)) {
				throw createAbortError();
			}

			this.failureReason = errorToMessage(error);
			await this.releaseIterator();
			this.pcmSegments.length = 0;
			return this.createFailure(startSeconds, endSeconds);
		}
	}

	cancel(): Promise<void> {
		if (this.cancelPromise) return this.cancelPromise;
		this.cancelled = true;
		this.pcmSegments.length = 0;
		this.packetRanges.length = 0;
		this.packetCursor = null;
		this.cancelPromise = settleCleanup([
			this.releaseIterator(),
			this.activePull?.then(
				() => undefined,
				() => undefined,
			) ?? Promise.resolve(),
		]);
		return this.cancelPromise;
	}

	private async releaseIterator() {
		const iterator = this.iterator;
		this.iterator = null;
		this.iteratorEnded = true;
		await iterator?.return();
	}

	private async scanPacketsThrough(
		endSeconds: number,
		isGenerationCancelled: () => boolean,
	) {
		const options = { metadataOnly: true } as const;
		const packetSink = this.packetSink;
		if (!packetSink) throw new Error("Audio packet reader is unavailable.");

		if (!this.packetCursorInitialized) {
			this.packetCursor =
				(await packetSink.getPacket(this.generationStartSeconds, options)) ??
				(await packetSink.getFirstPacket(options));
			this.packetCursorInitialized = true;
		}

		while (this.packetCursor && this.packetCursor.timestamp < endSeconds) {
			this.throwIfUnavailable(isGenerationCancelled);
			const packet = this.packetCursor;
			if (
				Number.isFinite(packet.timestamp) &&
				Number.isFinite(packet.duration) &&
				packet.duration > 0
			) {
				this.packetRanges.push({
					endSeconds: packet.timestamp + packet.duration,
					startSeconds: packet.timestamp,
				});
			}

			this.packetCursor = await packetSink.getNextPacket(packet, options);
		}

		this.packetRanges.sort(
			(left, right) => left.startSeconds - right.startSeconds,
		);
	}

	private async decodeThrough(
		requiredEndSeconds: number,
		isGenerationCancelled: () => boolean,
	) {
		if (!this.iterator && !this.iteratorEnded && this.descriptor.track) {
			this.iterator = new AudioSampleSink(this.descriptor.track).samples(
				this.generationStartSeconds,
				this.descriptor.trackEndSeconds,
			);
		}

		while (
			this.iterator &&
			!this.iteratorEnded &&
			this.decodedThroughSeconds < requiredEndSeconds
		) {
			this.throwIfUnavailable(isGenerationCancelled);
			const result = await this.iterator.next();
			if (isGenerationCancelled() || this.cancelled) {
				if (!result.done) {
					result.value.close();
				}
				this.throwIfUnavailable(isGenerationCancelled);
			}

			if (result.done) {
				this.iteratorEnded = true;
				this.iterator = null;
				break;
			}

			this.copySample(result.value);
		}
	}

	private copySample(sample: AudioSample) {
		try {
			const { numberOfChannels, sampleRate } = this.descriptor.format;
			if (
				sample.sampleRate !== sampleRate ||
				sample.numberOfChannels !== numberOfChannels
			) {
				throw new Error(
					`Decoded audio format changed from ${sampleRate}Hz/${numberOfChannels} channels to ${sample.sampleRate}Hz/${sample.numberOfChannels} channels.`,
				);
			}

			const channels = Array.from(
				{ length: numberOfChannels },
				(_, channel) => {
					const data = new Float32Array(sample.numberOfFrames);
					sample.copyTo(data, {
						format: "f32-planar",
						frameCount: sample.numberOfFrames,
						frameOffset: 0,
						planeIndex: channel,
					});
					return data;
				},
			);
			const projectedStartSeconds = this.projectDecodedTimestamp(
				sample.timestamp,
				sampleRate,
			);
			const endSeconds =
				projectedStartSeconds + sample.numberOfFrames / sampleRate;

			this.pcmSegments.push({
				channels,
				endSeconds,
				sampleRate,
				startSeconds: projectedStartSeconds,
			});
			this.decodedThroughSeconds = Math.max(
				this.decodedThroughSeconds,
				endSeconds,
			);
		} finally {
			sample.close();
		}
	}

	private projectDecodedTimestamp(
		decodedTimestampSeconds: number,
		sampleRate: number,
	) {
		if (!this.timestampProjectionCalibrated) {
			const anchorPacket = this.packetRanges.find(
				(range) => range.endSeconds > this.generationStartSeconds,
			);
			if (anchorPacket) {
				this.projectedGapSeconds = Math.max(
					0,
					anchorPacket.startSeconds - decodedTimestampSeconds,
				);
				this.projectedThroughGapEndSeconds = anchorPacket.startSeconds;
			}
			this.timestampProjectionCalibrated = true;
		}

		const gaps = findPacketGaps(this.packetRanges, sampleRate);
		let projectedTimestampSeconds =
			decodedTimestampSeconds + this.projectedGapSeconds;

		for (const gap of gaps) {
			if (gap.endSeconds <= this.projectedThroughGapEndSeconds) {
				continue;
			}
			if (projectedTimestampSeconds < gap.startSeconds) {
				break;
			}

			this.projectedThroughGapEndSeconds = gap.endSeconds;
			if (projectedTimestampSeconds >= gap.endSeconds) {
				continue;
			}

			const collapsedGapSeconds = gap.endSeconds - gap.startSeconds;
			this.projectedGapSeconds += collapsedGapSeconds;
			projectedTimestampSeconds += collapsedGapSeconds;
		}

		return projectedTimestampSeconds;
	}

	private prunePacketRanges(throughSeconds: number) {
		let predecessor: PacketRange | null = null;
		const futureRanges: PacketRange[] = [];

		for (const range of this.packetRanges) {
			if (range.endSeconds <= throughSeconds) {
				if (!predecessor || range.endSeconds > predecessor.endSeconds) {
					predecessor = range;
				}
				continue;
			}
			futureRanges.push(range);
		}

		this.packetRanges.length = 0;
		if (predecessor) {
			this.packetRanges.push(predecessor);
		}
		this.packetRanges.push(...futureRanges);
	}

	private consumeChunks(
		startSeconds: number,
		endSeconds: number,
		occupiedRanges: readonly PacketRange[],
	) {
		const slices = occupiedRanges.flatMap((range) =>
			collectPcmSlices(
				this.pcmSegments,
				Math.max(startSeconds, range.startSeconds),
				Math.min(endSeconds, range.endSeconds),
			),
		);
		const chunks = batchPcmSlices({
			batchDurationSeconds: this.batchDurationSeconds,
			format: this.descriptor.format,
			slices,
			trackId: this.descriptor.trackId,
		});

		consumeSegmentsThrough(this.pcmSegments, endSeconds);
		return chunks;
	}

	private createFailure(
		startSeconds: number,
		endSeconds: number,
	): MediaWindowFailedTrackState {
		return {
			endSeconds,
			kind: "failure",
			reason: this.failureReason ?? "Audio window preparation failed.",
			startSeconds,
			state: "failure",
			trackId: this.descriptor.trackId,
		};
	}

	private throwIfUnavailable(isGenerationCancelled: () => boolean) {
		if (isGenerationCancelled()) {
			throw createAbortError();
		}
		if (this.cancelled) {
			throw new TrackCursorCancelledError();
		}
	}
}

class TrackCursorCancelledError extends Error {}

type PcmSlice = {
	channels: Float32Array[];
	endSeconds: number;
	startSeconds: number;
};

function collectPcmSlices(
	segments: readonly PcmSegment[],
	startSeconds: number,
	endSeconds: number,
): PcmSlice[] {
	const slices: PcmSlice[] = [];

	for (const segment of segments) {
		if (
			segment.endSeconds <= startSeconds ||
			segment.startSeconds >= endSeconds
		) {
			continue;
		}

		const frameOffset = Math.max(
			0,
			Math.round(
				(Math.max(startSeconds, segment.startSeconds) - segment.startSeconds) *
					segment.sampleRate,
			),
		);
		const endFrame = Math.min(
			segment.channels[0]?.length ?? 0,
			Math.round(
				(Math.min(endSeconds, segment.endSeconds) - segment.startSeconds) *
					segment.sampleRate,
			),
		);
		if (endFrame <= frameOffset) {
			continue;
		}

		const sliceStartSeconds =
			segment.startSeconds + frameOffset / segment.sampleRate;
		slices.push({
			channels: segment.channels.map((channel) =>
				channel.slice(frameOffset, endFrame),
			),
			endSeconds:
				sliceStartSeconds + (endFrame - frameOffset) / segment.sampleRate,
			startSeconds: sliceStartSeconds,
		});
	}

	return slices.sort((left, right) => left.startSeconds - right.startSeconds);
}

function consumeSegmentsThrough(segments: PcmSegment[], endSeconds: number) {
	for (let index = segments.length - 1; index >= 0; index -= 1) {
		const segment = segments[index];
		if (!segment || segment.startSeconds >= endSeconds) {
			continue;
		}

		if (segment.endSeconds <= endSeconds) {
			segments.splice(index, 1);
			continue;
		}

		const consumedFrames = Math.max(
			0,
			Math.round((endSeconds - segment.startSeconds) * segment.sampleRate),
		);
		segment.channels = segment.channels.map((channel) =>
			channel.slice(consumedFrames),
		);
		segment.startSeconds += consumedFrames / segment.sampleRate;
	}
}

function batchPcmSlices({
	batchDurationSeconds,
	format,
	slices,
	trackId,
}: {
	batchDurationSeconds: number;
	format: TrackDescriptor["format"];
	slices: readonly PcmSlice[];
	trackId: string;
}): MediaWindowChunk[] {
	const maximumFrames = Math.max(
		1,
		Math.floor(batchDurationSeconds * format.sampleRate),
	);
	const chunks: MediaWindowChunk[] = [];
	let batchStartSeconds: number | null = null;
	let batchChannels = Array.from(
		{ length: format.numberOfChannels },
		() => [] as Float32Array[],
	);
	let batchFrameCount = 0;

	const flush = () => {
		if (batchStartSeconds === null || batchFrameCount === 0) {
			return;
		}

		const audioBuffer = new AudioBuffer({
			length: batchFrameCount,
			numberOfChannels: format.numberOfChannels,
			sampleRate: format.sampleRate,
		});
		for (let channel = 0; channel < format.numberOfChannels; channel += 1) {
			const destination = audioBuffer.getChannelData(channel);
			let offset = 0;
			for (const piece of batchChannels[channel] ?? []) {
				destination.set(piece, offset);
				offset += piece.length;
			}
		}

		chunks.push({
			audioBuffer,
			endSeconds: batchStartSeconds + batchFrameCount / format.sampleRate,
			startSeconds: batchStartSeconds,
			trackId,
		});
		batchStartSeconds = null;
		batchChannels = Array.from(
			{ length: format.numberOfChannels },
			() => [] as Float32Array[],
		);
		batchFrameCount = 0;
	};

	for (const slice of slices) {
		let sliceOffset = 0;
		const sliceLength = slice.channels[0]?.length ?? 0;

		while (sliceOffset < sliceLength) {
			const pieceStartSeconds =
				slice.startSeconds + sliceOffset / format.sampleRate;
			const expectedStartSeconds =
				batchStartSeconds === null
					? pieceStartSeconds
					: batchStartSeconds + batchFrameCount / format.sampleRate;
			if (
				batchStartSeconds !== null &&
				Math.abs(pieceStartSeconds - expectedStartSeconds) >
					1 / format.sampleRate
			) {
				flush();
			}

			batchStartSeconds ??= pieceStartSeconds;
			const frameCount = Math.min(
				maximumFrames - batchFrameCount,
				sliceLength - sliceOffset,
			);
			for (let channel = 0; channel < format.numberOfChannels; channel += 1) {
				batchChannels[channel]?.push(
					(slice.channels[channel] ?? new Float32Array()).subarray(
						sliceOffset,
						sliceOffset + frameCount,
					),
				);
			}
			batchFrameCount += frameCount;
			sliceOffset += frameCount;

			if (batchFrameCount === maximumFrames) {
				flush();
			}
		}
	}

	flush();
	return chunks;
}

function intersectRanges(
	ranges: readonly PacketRange[],
	startSeconds: number,
	endSeconds: number,
) {
	const intersections = ranges
		.filter(
			(range) =>
				range.startSeconds < endSeconds && range.endSeconds > startSeconds,
		)
		.map((range) => ({
			endSeconds: Math.min(endSeconds, range.endSeconds),
			startSeconds: Math.max(startSeconds, range.startSeconds),
		}))
		.sort((left, right) => left.startSeconds - right.startSeconds);
	const merged: PacketRange[] = [];

	for (const range of intersections) {
		const previous = merged.at(-1);
		if (previous && range.startSeconds <= previous.endSeconds) {
			previous.endSeconds = Math.max(previous.endSeconds, range.endSeconds);
		} else {
			merged.push({ ...range });
		}
	}

	return merged;
}

function findPacketGaps(
	ranges: readonly PacketRange[],
	sampleRate: number,
): PacketRange[] {
	const gaps: PacketRange[] = [];
	const toleranceSeconds = 2 / sampleRate;
	let previousEndSeconds: number | null = null;

	for (const range of ranges) {
		if (
			previousEndSeconds !== null &&
			range.startSeconds - previousEndSeconds > toleranceSeconds
		) {
			gaps.push({
				endSeconds: range.startSeconds,
				startSeconds: previousEndSeconds,
			});
		}
		previousEndSeconds = Math.max(
			previousEndSeconds ?? Number.NEGATIVE_INFINITY,
			range.endSeconds,
		);
	}

	return gaps;
}

async function describeTrack(
	track: InputAudioTrack | null,
	trackId: string,
	trackIndex: number,
	fallback: { channels?: number; sampleRate?: number },
): Promise<TrackDescriptor> {
	try {
		if (!track)
			throw new Error("The analyzed audio track is no longer available.");
		const [
			canDecode,
			firstTimestampSeconds,
			numberOfChannels,
			sampleRate,
			trackEndSeconds,
		] = await Promise.all([
			track.canDecode(),
			track.getFirstTimestamp(),
			track.getNumberOfChannels(),
			track.getSampleRate(),
			track.computeDuration(),
		]);
		validateTrackFormat(numberOfChannels, sampleRate);
		if (
			!Number.isFinite(firstTimestampSeconds) ||
			!Number.isFinite(trackEndSeconds) ||
			trackEndSeconds <= Math.max(0, firstTimestampSeconds)
		)
			throw new Error("Track has no presentable audio range.");

		return {
			failureReason: canDecode
				? null
				: "Track is not decodable in this browser.",
			firstTimestampSeconds,
			format: { numberOfChannels, sampleRate },
			track,
			trackEndSeconds,
			trackId,
			trackIndex,
		};
	} catch (error) {
		return {
			failureReason: errorToMessage(error),
			firstTimestampSeconds: 0,
			format: {
				numberOfChannels: fallback.channels || 1,
				sampleRate: fallback.sampleRate || 48_000,
			},
			track,
			trackEndSeconds: 0,
			trackId,
			trackIndex,
		};
	}
}

function normalizeTrackIds(
	requestedTrackIds: ReadonlySet<string> | readonly string[] | undefined,
	availableTrackIds: readonly string[],
) {
	if (!requestedTrackIds) {
		return [...availableTrackIds];
	}

	const requested = new Set(requestedTrackIds);
	for (const trackId of requested) {
		if (!availableTrackIds.includes(trackId)) {
			throw new Error(`Unknown audio track: ${trackId}.`);
		}
	}

	return availableTrackIds.filter((trackId) => requested.has(trackId));
}

function isMediaWindowTrackState(
	state: MediaWindowTrackState | null,
): state is MediaWindowTrackState {
	return state !== null;
}

function validateBatchDuration(batchDurationSeconds: number) {
	if (
		!Number.isFinite(batchDurationSeconds) ||
		batchDurationSeconds <= 0 ||
		batchDurationSeconds > MAX_BATCH_DURATION_SECONDS
	) {
		throw new RangeError(
			`Audio batch duration must be greater than zero and at most ${MAX_BATCH_DURATION_SECONDS} seconds.`,
		);
	}
}

function validateTimestamp(timestamp: number, name: string) {
	if (!Number.isFinite(timestamp) || timestamp < 0) {
		throw new RangeError(`${name} must be a non-negative finite timestamp.`);
	}
}

function validateTrackFormat(numberOfChannels: number, sampleRate: number) {
	if (
		!Number.isSafeInteger(numberOfChannels) ||
		numberOfChannels <= 0 ||
		!Number.isSafeInteger(sampleRate) ||
		sampleRate <= 0
	) {
		throw new Error(
			`Invalid audio track format: ${sampleRate}Hz/${numberOfChannels} channels.`,
		);
	}
}

function createAbortError() {
	return new DOMException(
		"Media window generation was cancelled.",
		"AbortError",
	);
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === "AbortError";
}

function errorToMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

async function settleCleanup(
	promises: readonly Promise<void>[],
): Promise<void> {
	const results = await Promise.allSettled(promises);
	const errors = results.flatMap((result) =>
		result.status === "rejected" ? [result.reason] : [],
	);
	if (errors.length)
		throw new AggregateError(errors, "Audio generation cleanup failed.");
}

function reportGenerationCleanupFailure(error: unknown) {
	console.error("Preview audio generation cleanup failed.", error);
}
