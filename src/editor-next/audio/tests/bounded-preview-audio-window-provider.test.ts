import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaMock = vi.hoisted(() => ({
	inputs: [] as MockInput[],
	tracks: [] as MockTrack[],
}));

vi.mock("mediabunny", () => ({
	ALL_FORMATS: [],
	AudioSampleSink: class AudioSampleSink {
		constructor(private readonly track: MockTrack) {}

		samples(startSeconds?: number, endSeconds?: number) {
			this.track.sampleCalls.push([startSeconds, endSeconds]);
			const iterator = this.track.iterators.shift();
			if (!iterator) {
				throw new Error(`No sample iterator configured for ${this.track.id}.`);
			}

			return iterator;
		}
	},
	BlobSource: class BlobSource {
		constructor(readonly blob: Blob) {}
	},
	EncodedPacketSink: class EncodedPacketSink {
		constructor(private readonly track: MockTrack) {}

		async getFirstPacket(options: { metadataOnly?: boolean }) {
			this.track.packetCalls.push(["first", options]);
			return this.track.packets[0] ?? null;
		}

		async getNextPacket(
			packet: MockPacket,
			options: { metadataOnly?: boolean },
		) {
			this.track.packetCalls.push(["next", options]);
			const index = this.track.packets.indexOf(packet);
			return this.track.packets[index + 1] ?? null;
		}

		async getPacket(timestamp: number, options: { metadataOnly?: boolean }) {
			this.track.packetCalls.push(["at", options]);
			for (let index = this.track.packets.length - 1; index >= 0; index -= 1) {
				const packet = this.track.packets[index];
				if (packet && packet.timestamp <= timestamp) {
					return packet;
				}
			}

			return null;
		}

		packets() {
			this.track.fullPacketScanCalls += 1;
			throw new Error(
				"Full packet scans are forbidden in the bounded provider.",
			);
		}
	},
	Input: class Input implements MockInput {
		dispose = vi.fn();

		constructor() {
			mediaMock.inputs.push(this);
		}

		async getAudioTracks() {
			return mediaMock.tracks;
		}
	},
}));

import { createMediaWindowProvider } from "../engine/media-window-provider";

beforeEach(() => {
	mediaMock.inputs = [];
	mediaMock.tracks = [];
	vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
});

describe("createMediaWindowProvider", () => {
	it("retains one Input and one pull-driven iterator across adjacent bounded pulls", async () => {
		const sample = createAudioSample({
			channels: [[1, 2, 3, 4]],
			sampleRate: 10,
			timestamp: 0,
		});
		const iterator = createSampleIterator([sample]);
		const track = createTrack({
			iterators: [iterator],
			packets: [createPacket(0, 0.4)],
		});
		mediaMock.tracks = [track];

		const provider = await createMediaWindowProvider({
			batchDurationSeconds: 0.2,
			source: new Blob(["fixture"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});

		const first = await generation.pullThrough(0.2);
		const second = await generation.pullThrough(0.4);

		expect(provider.trackIds).toEqual(["audio-1"]);
		expect(provider.durationSeconds).toBe(1);
		expect(first.tracks).toEqual([
			expect.objectContaining({
				chunks: [
					expect.objectContaining({
						endSeconds: 0.2,
						startSeconds: 0,
					}),
				],
				kind: "playable",
				trackId: "audio-1",
			}),
		]);
		expect(second.tracks).toEqual([
			expect.objectContaining({
				chunks: [
					expect.objectContaining({
						endSeconds: 0.4,
						startSeconds: 0.2,
					}),
				],
				kind: "playable",
				trackId: "audio-1",
			}),
		]);
		expect(track.sampleCalls).toEqual([[0, 1]]);
		expect(sample.close).toHaveBeenCalledOnce();
		expect(iterator.return).not.toHaveBeenCalled();
		expect(mediaMock.inputs[0]?.dispose).not.toHaveBeenCalled();

		await provider.dispose();
		await provider.dispose();

		expect(iterator.return).toHaveBeenCalledOnce();
		expect(mediaMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});

	it("keeps distinct monitored-track PCM separated by track identity", async () => {
		mediaMock.tracks = [
			createTrack({
				id: "audio-440",
				iterators: [
					createSampleIterator([
						createAudioSample({
							channels: [[1, 2]],
							sampleRate: 10,
							timestamp: 0,
						}),
					]),
				],
				packets: [createPacket(0, 0.2)],
			}),
			createTrack({
				id: "audio-880",
				iterators: [
					createSampleIterator([
						createAudioSample({
							channels: [[9, 8]],
							sampleRate: 10,
							timestamp: 0,
						}),
					]),
				],
				packets: [createPacket(0, 0.2)],
			}),
		];
		const provider = await createMediaWindowProvider({
			source: new Blob(["two tones"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});

		const result = await generation.pullThrough(0.2);
		const chunks = result.tracks.map((track) => {
			if (track.kind !== "playable") throw new Error("Expected playable PCM.");
			return [
				track.trackId,
				Array.from(track.chunks[0]?.audioBuffer.getChannelData(0) ?? []),
			] as const;
		});

		expect(chunks).toEqual([
			["audio-440", [1, 2]],
			["audio-880", [9, 8]],
		]);

		await provider.dispose();
	});

	it("reports non-zero starts and packet gaps as silence without a full-track scan", async () => {
		const beforeGap = createAudioSample({
			channels: [[1, 2]],
			sampleRate: 10,
			timestamp: 0.5,
		});
		const afterCollapsedGap = createAudioSample({
			channels: [[3, 4]],
			sampleRate: 10,
			timestamp: 0.7,
		});
		const afterGapContinuation = createAudioSample({
			channels: [[5, 6]],
			sampleRate: 10,
			timestamp: 0.9,
		});
		const track = createTrack({
			iterators: [
				createSampleIterator([
					beforeGap,
					afterCollapsedGap,
					afterGapContinuation,
				]),
			],
			packets: [createPacket(0.5, 0.2), createPacket(1, 0.4)],
		});
		mediaMock.tracks = [track];
		const provider = await createMediaWindowProvider({
			source: new Blob(["fixture"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});

		const leading = await generation.pullThrough(0.4);
		const decoded = await generation.pullThrough(1.4);

		expect(leading.tracks).toEqual([
			{
				endSeconds: 0.4,
				kind: "silence",
				startSeconds: 0,
				state: "silence",
				trackId: "audio-1",
			},
		]);
		expect(track.sampleCalls).toEqual([[0, 1.4]]);
		expect(decoded.tracks).toEqual([
			expect.objectContaining({
				chunks: [
					expect.objectContaining({
						endSeconds: 0.7,
						startSeconds: 0.5,
					}),
					expect.objectContaining({
						endSeconds: 1.2,
						startSeconds: 1,
					}),
					expect.objectContaining({
						endSeconds: expect.closeTo(1.4, 5),
						startSeconds: expect.closeTo(1.2, 5),
					}),
				],
				kind: "playable",
			}),
		]);
		expect(beforeGap.close).toHaveBeenCalledOnce();
		expect(afterCollapsedGap.close).toHaveBeenCalledOnce();
		expect(afterGapContinuation.close).toHaveBeenCalledOnce();
		expect(track.fullPacketScanCalls).toBe(0);
		expect(track.packetCalls).toHaveLength(4);
		expect(
			track.packetCalls.every(([, options]) => options.metadataOnly === true),
		).toBe(true);

		await provider.dispose();
	});

	it("bounds packet metadata work to the requested horizon on a long track", async () => {
		const packets = Array.from({ length: 1_000 }, (_, index) =>
			createPacket(index / 10, 0.1),
		);
		const track = createTrack({
			iterators: [
				createSampleIterator([
					createAudioSample({
						channels: [[1, 2]],
						sampleRate: 10,
						timestamp: 0,
					}),
				]),
			],
			packets,
		});
		mediaMock.tracks = [track];
		const provider = await createMediaWindowProvider({
			source: new Blob(["long fixture"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});

		await generation.pullThrough(0.2);

		expect(track.packetCalls.length).toBeLessThanOrEqual(3);
		expect(track.fullPacketScanCalls).toBe(0);

		await provider.dispose();
	});

	it("projects a collapsed gap when the generation starts inside that gap", async () => {
		const afterGap = createAudioSample({
			channels: [[7, 8]],
			sampleRate: 10,
			timestamp: 0.2,
		});
		mediaMock.tracks = [
			createTrack({
				iterators: [createSampleIterator([afterGap])],
				packets: [createPacket(0, 0.2), createPacket(0.8, 0.2)],
			}),
		];
		const provider = await createMediaWindowProvider({
			source: new Blob(["gap fixture"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0.5,
		});

		const result = await generation.pullThrough(1);

		expect(result.tracks).toEqual([
			expect.objectContaining({
				chunks: [
					expect.objectContaining({
						endSeconds: 1,
						startSeconds: 0.8,
					}),
				],
				state: "playable",
			}),
		]);
		expect(afterGap.close).toHaveBeenCalledOnce();

		await provider.dispose();
	});

	it("anchors collapsed timestamps after seeking beyond an earlier gap", async () => {
		const afterSeek = createAudioSample({
			channels: [[9, 10]],
			sampleRate: 10,
			timestamp: 0.9,
		});
		mediaMock.tracks = [
			createTrack({
				iterators: [createSampleIterator([afterSeek])],
				packets: [createPacket(0.5, 0.2), createPacket(1.2, 0.2)],
			}),
		];
		const provider = await createMediaWindowProvider({
			source: new Blob(["post-gap seek fixture"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 1.2,
		});

		const result = await generation.pullThrough(1.4);

		expect(result.tracks).toEqual([
			expect.objectContaining({
				chunks: [
					expect.objectContaining({
						endSeconds: expect.closeTo(1.4, 5),
						startSeconds: 1.2,
					}),
				],
				state: "playable",
			}),
		]);
		expect(afterSeek.close).toHaveBeenCalledOnce();

		await provider.dispose();
	});

	it("returns a pending iterator immediately on abort and rejects its late sample", async () => {
		const pending = createPendingSampleIterator();
		const sample = createAudioSample({
			channels: [[1, 2]],
			sampleRate: 10,
			timestamp: 0,
		});
		const track = createTrack({
			iterators: [pending.iterator],
			packets: [createPacket(0, 0.2)],
		});
		mediaMock.tracks = [track];
		const provider = await createMediaWindowProvider({
			source: new Blob(["fixture"]),
		});
		const controller = new AbortController();
		const generation = provider.openGeneration({
			signal: controller.signal,
			startSeconds: 0,
		});
		const result = generation.pullThrough(0.2);

		await vi.waitFor(() =>
			expect(pending.iterator.next).toHaveBeenCalledOnce(),
		);
		controller.abort();

		expect(pending.iterator.return).toHaveBeenCalledOnce();
		expect(mediaMock.inputs[0]?.dispose).not.toHaveBeenCalled();
		pending.resolve({ done: false, value: sample });

		await expect(result).rejects.toMatchObject({ name: "AbortError" });
		expect(sample.close).toHaveBeenCalledOnce();

		await provider.dispose();
		expect(mediaMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});

	it("closes a malformed sample and exposes an explicit per-track failure", async () => {
		const sample = createAudioSample({
			channels: [[1], [2]],
			sampleRate: 10,
			timestamp: 0,
		});
		const track = createTrack({
			iterators: [createSampleIterator([sample])],
			packets: [createPacket(0, 0.1)],
		});
		mediaMock.tracks = [track];
		const provider = await createMediaWindowProvider({
			source: new Blob(["fixture"]),
		});
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});

		const result = await generation.pullThrough(0.1);

		expect(result.tracks).toEqual([
			expect.objectContaining({
				kind: "failure",
				reason: expect.stringContaining("Decoded audio format changed"),
				trackId: "audio-1",
			}),
		]);
		expect(sample.close).toHaveBeenCalledOnce();

		await provider.dispose();
	});

	it("closes the current sample and publishes nothing when abort occurs during copy", async () => {
		const controller = new AbortController();
		const sample = createAudioSample({
			channels: [[1, 2]],
			onCopy: () => controller.abort(),
			sampleRate: 10,
			timestamp: 0,
		});
		const iterator = createSampleIterator([sample]);
		mediaMock.tracks = [
			createTrack({
				iterators: [iterator],
				packets: [createPacket(0, 0.2)],
			}),
		];
		const provider = await createMediaWindowProvider({
			source: new Blob(["fixture"]),
		});
		const generation = provider.openGeneration({
			signal: controller.signal,
			startSeconds: 0,
		});

		await expect(generation.pullThrough(0.2)).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(sample.close).toHaveBeenCalledOnce();
		expect(iterator.return).toHaveBeenCalledOnce();

		await provider.dispose();
	});

	it("invalidates stale work and can retry only a selected failed track", async () => {
		const stalePending = createPendingSampleIterator();
		const successfulSample = createAudioSample({
			channels: [[1, 2]],
			sampleRate: 10,
			timestamp: 0,
		});
		const staleSample = createAudioSample({
			channels: [[3, 4]],
			sampleRate: 10,
			timestamp: 0,
		});
		const retrySample = createAudioSample({
			channels: [[5, 6]],
			sampleRate: 10,
			timestamp: 0,
		});
		const successfulTrack = createTrack({
			id: "audio-1",
			iterators: [createSampleIterator([successfulSample])],
			packets: [createPacket(0, 0.2)],
		});
		const retriedTrack = createTrack({
			id: "audio-2",
			iterators: [stalePending.iterator, createSampleIterator([retrySample])],
			packets: [createPacket(0, 0.2)],
		});
		mediaMock.tracks = [successfulTrack, retriedTrack];
		const provider = await createMediaWindowProvider({
			source: new Blob(["fixture"]),
		});
		const staleGeneration = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});
		const staleResult = staleGeneration.pullThrough(0.2);
		await vi.waitFor(() =>
			expect(stalePending.iterator.next).toHaveBeenCalledOnce(),
		);

		const retryGeneration = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
			trackIds: new Set(["audio-2"]),
		});
		stalePending.resolve({ done: false, value: staleSample });

		await expect(staleResult).resolves.toEqual(
			expect.objectContaining({
				tracks: [
					expect.objectContaining({
						kind: "playable",
						trackId: "audio-1",
					}),
				],
			}),
		);
		const retry = await retryGeneration.pullThrough(0.2);

		expect(retryGeneration.trackIds).toEqual(["audio-2"]);
		expect(retry.tracks).toEqual([
			expect.objectContaining({ kind: "playable", trackId: "audio-2" }),
		]);
		expect(successfulTrack.sampleCalls).toHaveLength(1);
		expect(retriedTrack.sampleCalls).toHaveLength(2);
		expect(stalePending.iterator.return).toHaveBeenCalledOnce();
		expect(successfulSample.close).toHaveBeenCalledOnce();
		expect(staleSample.close).toHaveBeenCalledOnce();
		expect(retrySample.close).toHaveBeenCalledOnce();

		await provider.dispose();
	});
	it.each(["capability", "metadata"])(
		"re-reads failed %s on isolated retry while retaining the healthy iterator",
		async (failure) => {
			const healthy = createTrack({
				id: "embedded-1",
				packets: [createPacket(0, 0.4)],
				iterators: [
					createSampleIterator([
						createAudioSample({
							channels: [[1, 2, 3, 4]],
							sampleRate: 10,
							timestamp: 0,
						}),
					]),
				],
			});
			const failed = createTrack({
				id: "embedded-2",
				packets: [createPacket(0, 0.2)],
				iterators: [
					createSampleIterator([
						createAudioSample({
							channels: [[5, 6]],
							sampleRate: 10,
							timestamp: 0,
						}),
					]),
				],
			});
			if (failure === "capability")
				failed.canDecode.mockResolvedValueOnce(false).mockResolvedValue(true);
			else
				failed.getSampleRate
					.mockRejectedValueOnce(new Error("metadata failed"))
					.mockResolvedValue(10);
			mediaMock.tracks = [healthy, failed];
			const provider = await createMediaWindowProvider({
				source: new Blob(),
				tracks: [{ id: "voice" }, { id: "desktop" }],
			});
			const generation = provider.openGeneration({
				signal: new AbortController().signal,
				startSeconds: 0,
			});
			const initial = await generation.pullThrough(0.2);
			expect(initial.tracks.map((track) => track.kind)).toEqual([
				"playable",
				"failure",
			]);
			const retry = provider.openGeneration({
				signal: new AbortController().signal,
				startSeconds: 0,
				trackIds: ["desktop"],
				retryTrackIds: ["desktop"],
			});
			expect((await retry.pullThrough(0.2)).tracks[0]?.kind).toBe("playable");
			expect(provider.getTrackMetadata("desktop")).toEqual({
				failureReason: null,
				numberOfChannels: 1,
				sampleRate: 10,
			});
			expect((await generation.pullThrough(0.4)).tracks[0]?.trackId).toBe(
				"voice",
			);
			expect(healthy.canDecode).toHaveBeenCalledOnce();
			expect(failed.canDecode).toHaveBeenCalledTimes(2);
			expect(healthy.sampleCalls).toHaveLength(1);
			expect(mediaMock.inputs).toHaveLength(1);
			await provider.dispose();
		},
	);

	it("waits for the last replaced cursor's return before opening its replacement", async () => {
		let finishReturn!: () => void;
		const returnDone = new Promise<void>((resolve) => {
			finishReturn = resolve;
		});
		const first = createSampleIterator([
			createAudioSample({ channels: [[1, 2]], sampleRate: 10, timestamp: 0 }),
		]);
		first.return.mockImplementation(async () => {
			await returnDone;
			return { done: true, value: undefined };
		});
		const second = createSampleIterator([
			createAudioSample({ channels: [[3, 4]], sampleRate: 10, timestamp: 0 }),
		]);
		mediaMock.tracks = [
			createTrack({
				iterators: [first, second],
				packets: [createPacket(0, 0.2)],
			}),
		];
		const provider = await createMediaWindowProvider({ source: new Blob() });
		await provider
			.openGeneration({ signal: new AbortController().signal, startSeconds: 0 })
			.pullThrough(0.2);
		const retry = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});
		const result = retry.pullThrough(0.2);
		await Promise.resolve();
		await Promise.resolve();
		expect(first.return).toHaveBeenCalledOnce();
		expect(second.next).not.toHaveBeenCalled();
		finishReturn();
		await result;
		expect(second.next).toHaveBeenCalledOnce();
		await provider.dispose();
	});

	it("awaits late sample closure before disposing Input, including concurrent dispose calls", async () => {
		const pending = createPendingSampleIterator();
		const sample = createAudioSample({
			channels: [[1, 2]],
			sampleRate: 10,
			timestamp: 0,
		});
		mediaMock.tracks = [
			createTrack({
				iterators: [pending.iterator],
				packets: [createPacket(0, 0.2)],
			}),
		];
		const provider = await createMediaWindowProvider({ source: new Blob() });
		const generation = provider.openGeneration({
			signal: new AbortController().signal,
			startSeconds: 0,
		});
		const result = generation.pullThrough(0.2);
		const rejected = expect(result).rejects.toMatchObject({
			name: "AbortError",
		});
		await vi.waitFor(() =>
			expect(pending.iterator.next).toHaveBeenCalledOnce(),
		);
		const disposal = provider.dispose();
		expect(provider.dispose()).toBe(disposal);
		await Promise.resolve();
		expect(mediaMock.inputs[0]?.dispose).not.toHaveBeenCalled();
		pending.resolve({ done: false, value: sample });
		await rejected;
		await disposal;
		expect(sample.close).toHaveBeenCalledOnce();
		expect(pending.iterator.return).toHaveBeenCalledOnce();
		expect(mediaMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});

	it("disposes Input even when one iterator cleanup rejects", async () => {
		const iterator = createSampleIterator([
			createAudioSample({ channels: [[1, 2]], sampleRate: 10, timestamp: 0 }),
		]);
		iterator.return.mockRejectedValue(new Error("iterator cleanup failed"));
		mediaMock.tracks = [
			createTrack({ iterators: [iterator], packets: [createPacket(0, 0.2)] }),
		];
		const provider = await createMediaWindowProvider({ source: new Blob() });
		await provider
			.openGeneration({ signal: new AbortController().signal, startSeconds: 0 })
			.pullThrough(0.2);
		await expect(provider.dispose()).rejects.toThrow(
			"Audio generation cleanup failed.",
		);
		expect(iterator.return).toHaveBeenCalledOnce();
		expect(mediaMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});
	it("reports abort-listener cleanup rejection while keeping explicit cancel awaitable", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const iterator = createSampleIterator([
				createAudioSample({ channels: [[1, 2]], sampleRate: 10, timestamp: 0 }),
			]);
			iterator.return.mockRejectedValue(new Error("iterator return failed"));
			mediaMock.tracks = [
				createTrack({ iterators: [iterator], packets: [createPacket(0, 0.2)] }),
			];
			const provider = await createMediaWindowProvider({ source: new Blob() });
			const abort = new AbortController();
			const generation = provider.openGeneration({
				signal: abort.signal,
				startSeconds: 0,
			});
			await generation.pullThrough(0.2);
			abort.abort();
			await expect(generation.cancel()).rejects.toThrow(
				"Audio generation cleanup failed.",
			);
			expect(log).toHaveBeenCalledWith(
				"Preview audio generation cleanup failed.",
				expect.any(AggregateError),
			);
			await provider.dispose();
			expect(mediaMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
		} finally {
			log.mockRestore();
		}
	});
});

type MockInput = {
	dispose: ReturnType<typeof vi.fn>;
};

type MockPacket = {
	duration: number;
	sequenceNumber: number;
	timestamp: number;
};

type MockAudioSample = {
	close: ReturnType<typeof vi.fn>;
	copyTo: (
		destination: Float32Array,
		options: {
			frameCount: number;
			frameOffset: number;
			planeIndex: number;
		},
	) => void;
	numberOfChannels: number;
	numberOfFrames: number;
	sampleRate: number;
	timestamp: number;
};

type MockSampleIterator = {
	[Symbol.asyncIterator]: () => MockSampleIterator;
	next: ReturnType<typeof vi.fn>;
	return: ReturnType<typeof vi.fn>;
	throw: ReturnType<typeof vi.fn>;
};

type MockTrack = {
	canDecode: ReturnType<typeof vi.fn>;
	computeDuration: ReturnType<typeof vi.fn>;
	fullPacketScanCalls: number;
	getFirstTimestamp: ReturnType<typeof vi.fn>;
	getNumberOfChannels: ReturnType<typeof vi.fn>;
	getSampleRate: ReturnType<typeof vi.fn>;
	id: string;
	iterators: MockSampleIterator[];
	packetCalls: Array<["at" | "first" | "next", { metadataOnly?: boolean }]>;
	packets: MockPacket[];
	sampleCalls: Array<[number | undefined, number | undefined]>;
};

function createTrack({
	id = "audio-1",
	iterators = [],
	packets = [],
}: {
	id?: string;
	iterators?: MockSampleIterator[];
	packets?: MockPacket[];
} = {}): MockTrack {
	return {
		canDecode: vi.fn(async () => true),
		computeDuration: vi.fn(async () =>
			Math.max(
				1,
				...packets.map((packet) => packet.timestamp + packet.duration),
			),
		),
		fullPacketScanCalls: 0,
		getFirstTimestamp: vi.fn(async () => packets[0]?.timestamp ?? 0),
		getNumberOfChannels: vi.fn(async () => 1),
		getSampleRate: vi.fn(async () => 10),
		id,
		iterators,
		packetCalls: [],
		packets,
		sampleCalls: [],
	};
}

function createPacket(timestamp: number, duration: number): MockPacket {
	return { duration, sequenceNumber: timestamp * 1_000, timestamp };
}

function createAudioSample({
	channels,
	onCopy,
	sampleRate,
	timestamp,
}: {
	channels: number[][];
	onCopy?: () => void;
	sampleRate: number;
	timestamp: number;
}): MockAudioSample {
	return {
		close: vi.fn(),
		copyTo(destination, options) {
			const channel = channels[options.planeIndex] ?? [];
			destination.set(
				channel.slice(
					options.frameOffset,
					options.frameOffset + options.frameCount,
				),
			);
			onCopy?.();
		},
		numberOfChannels: channels.length,
		numberOfFrames: channels[0]?.length ?? 0,
		sampleRate,
		timestamp,
	};
}

function createPendingSampleIterator() {
	let resolve!: (
		result:
			| { done: false; value: MockAudioSample }
			| { done: true; value: undefined },
	) => void;
	const nextPromise = new Promise<
		{ done: false; value: MockAudioSample } | { done: true; value: undefined }
	>((resolvePromise) => {
		resolve = resolvePromise;
	});
	const iterator = {
		next: vi.fn(() => nextPromise),
		return: vi.fn(async () => ({ done: true, value: undefined }) as const),
		throw: vi.fn(async (error: unknown) => {
			throw error;
		}),
		[Symbol.asyncIterator]() {
			return this;
		},
	} as MockSampleIterator;

	return { iterator, resolve };
}

function createSampleIterator(samples: MockAudioSample[]): MockSampleIterator {
	let index = 0;
	let returned = false;
	const iterator = {
		next: vi.fn(async () => {
			if (returned || index >= samples.length) {
				return { done: true, value: undefined } as const;
			}

			const value = samples[index];
			index += 1;
			return { done: false, value } as const;
		}),
		return: vi.fn(async () => {
			returned = true;
			return { done: true, value: undefined } as const;
		}),
		throw: vi.fn(async (error: unknown) => {
			throw error;
		}),
		[Symbol.asyncIterator]() {
			return this;
		},
	};

	return iterator as MockSampleIterator;
}

class FakeAudioBuffer {
	readonly duration: number;
	readonly length: number;
	readonly numberOfChannels: number;
	readonly sampleRate: number;
	private readonly channels: Float32Array[];

	constructor({
		length,
		numberOfChannels,
		sampleRate,
	}: {
		length: number;
		numberOfChannels: number;
		sampleRate: number;
	}) {
		this.duration = length / sampleRate;
		this.length = length;
		this.numberOfChannels = numberOfChannels;
		this.sampleRate = sampleRate;
		this.channels = Array.from(
			{ length: numberOfChannels },
			() => new Float32Array(length),
		);
	}

	getChannelData(channel: number) {
		return this.channels[channel] ?? new Float32Array();
	}
}
