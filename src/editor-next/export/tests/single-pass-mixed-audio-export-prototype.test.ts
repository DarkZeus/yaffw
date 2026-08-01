import { beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	audioAddFailure: undefined as Error | undefined,
	audioAdds: [] as unknown[],
	audioSources: [] as MockAudioSource[],
	blobSources: [] as Blob[],
	conversionExecuteFailure: undefined as Error | undefined,
	conversionExecutePending: false,
	conversions: [] as MockConversion[],
	inputs: [] as MockInput[],
	outputFinalizeFailure: undefined as Error | undefined,
	outputs: [] as MockOutput[],
}));

vi.mock("mediabunny", () => {
	class BlobSource {
		constructor(source: Blob) {
			mediabunnyMock.blobSources.push(source);
		}
	}

	class BufferTarget {
		buffer: ArrayBuffer | null = null;
	}

	class MockOutputFormat {
		readonly fileExtension: string = ".mp4";
		readonly mimeType: string = "video/mp4";

		getSupportedAudioCodecs() {
			return ["aac"];
		}

		getSupportedVideoCodecs() {
			return ["avc"];
		}
	}

	class Mp4OutputFormat extends MockOutputFormat {}
	class MovOutputFormat extends MockOutputFormat {}
	class MkvOutputFormat extends MockOutputFormat {}
	class MpegTsOutputFormat extends MockOutputFormat {}
	class WebMOutputFormat extends MockOutputFormat {
		override readonly fileExtension = ".webm";
		override readonly mimeType = "video/webm";
	}

	const Input = vi.fn().mockImplementation(() => {
		const input = { dispose: vi.fn() };
		mediabunnyMock.inputs.push(input);

		return input;
	});

	const Output = vi
		.fn()
		.mockImplementation(
			({ target }: { target: { buffer: ArrayBuffer | null } }) => {
				const output: MockOutput = {
					addAudioTrack: vi.fn(),
					cancel: vi.fn(async () => undefined),
					finalize: vi.fn(async () => {
						if (mediabunnyMock.outputFinalizeFailure) {
							throw mediabunnyMock.outputFinalizeFailure;
						}

						target.buffer = new Uint8Array([1, 2, 3, 4]).buffer;
					}),
					start: vi.fn(async () => undefined),
					target,
				};
				mediabunnyMock.outputs.push(output);

				return output;
			},
		);

	const Conversion = {
		init: vi.fn(async (config: MockConversionConfig) => {
			const conversion: MockConversion = {
				cancel: vi.fn(async () => undefined),
				config,
				execute: vi.fn(async () => {
					if (mediabunnyMock.conversionExecutePending) {
						await new Promise(() => undefined);
					}

					if (mediabunnyMock.conversionExecuteFailure) {
						throw mediabunnyMock.conversionExecuteFailure;
					}
				}),
			};
			mediabunnyMock.conversions.push(conversion);

			return conversion;
		}),
	};

	class AudioBufferSource {
		readonly add = vi.fn(async (audioBuffer: unknown) => {
			mediabunnyMock.audioAdds.push(audioBuffer);
			if (mediabunnyMock.audioAddFailure) {
				throw mediabunnyMock.audioAddFailure;
			}
		});
		readonly close = vi.fn();

		constructor() {
			mediabunnyMock.audioSources.push(this);
		}
	}

	class Quality {}

	return {
		ALL_FORMATS: {},
		AudioBufferSource,
		BlobSource,
		BufferTarget,
		Conversion,
		Input,
		MkvOutputFormat,
		MovOutputFormat,
		Mp4OutputFormat,
		MpegTsOutputFormat,
		Output,
		Quality,
		WebMOutputFormat,
	};
});

import {
	SinglePassMixedAudioPrototypeCancelledError,
	runSinglePassMixedAudioExportPrototype,
} from "../harness/single-pass-mixed-audio-export-prototype";

beforeEach(() => {
	mediabunnyMock.audioAddFailure = undefined;
	mediabunnyMock.audioAdds = [];
	mediabunnyMock.audioSources = [];
	mediabunnyMock.blobSources = [];
	mediabunnyMock.conversionExecuteFailure = undefined;
	mediabunnyMock.conversionExecutePending = false;
	mediabunnyMock.conversions = [];
	mediabunnyMock.inputs = [];
	mediabunnyMock.outputFinalizeFailure = undefined;
	mediabunnyMock.outputs = [];
});

describe("single-pass mixed-audio export prototype", () => {
	it("drives composable video conversion and Generated audio mix into one Output", async () => {
		const audioBuffer = {} as AudioBuffer;

		const result = await runSinglePassMixedAudioExportPrototype(
			createRequest({ audioBuffer }),
		);

		expect(result.blob.size).toBe(4);
		expect(result.metrics).toEqual({
			intermediateBytes: 0,
			outputCount: 1,
			videoPipelinePasses: 1,
		});
		expect(mediabunnyMock.blobSources).toHaveLength(1);
		expect(mediabunnyMock.outputs).toHaveLength(1);
		expect(mediabunnyMock.conversions[0]?.config).toMatchObject({
			audio: { discard: true },
			composable: true,
			output: mediabunnyMock.outputs[0],
			trim: { end: 1.75, start: 0.25 },
			video: { codec: "avc", fit: "fill", height: 90, width: 160 },
		});
		expect(mediabunnyMock.outputs[0]?.addAudioTrack).toHaveBeenCalledWith(
			mediabunnyMock.audioSources[0],
			{ name: "Mixed audio" },
		);
		expect(mediabunnyMock.outputs[0]?.start).toHaveBeenCalledOnce();
		expect(mediabunnyMock.conversions[0]?.execute).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioAdds).toEqual([audioBuffer]);
		expect(mediabunnyMock.audioSources[0]?.close).toHaveBeenCalledOnce();
		expect(mediabunnyMock.outputs[0]?.finalize).toHaveBeenCalledOnce();
		expect(mediabunnyMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
		expect(mediabunnyMock.outputs[0]?.cancel).not.toHaveBeenCalled();
		expect(mediabunnyMock.conversions[0]?.cancel).not.toHaveBeenCalled();
	});

	it("cancels conversion and Output when the Export job is aborted", async () => {
		const controller = new AbortController();
		mediabunnyMock.conversionExecutePending = true;

		const exportPromise = runSinglePassMixedAudioExportPrototype(
			createRequest({ signal: controller.signal }),
		);
		await waitForConversion();
		controller.abort();

		await expect(exportPromise).rejects.toBeInstanceOf(
			SinglePassMixedAudioPrototypeCancelledError,
		);
		expect(mediabunnyMock.conversions[0]?.cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.outputs[0]?.cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioSources[0]?.close).toHaveBeenCalledOnce();
		expect(mediabunnyMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});

	it.each([
		["conversion", "conversionExecuteFailure"],
		["audio", "audioAddFailure"],
	] as const)(
		"cancels and disposes after an injected %s failure",
		async (_boundary, failureKey) => {
			const failure = new Error(`Injected ${failureKey}.`);
			mediabunnyMock[failureKey] = failure;

			await expect(
				runSinglePassMixedAudioExportPrototype(createRequest()),
			).rejects.toBe(failure);
			expect(mediabunnyMock.conversions[0]?.cancel).toHaveBeenCalledOnce();
			expect(mediabunnyMock.outputs[0]?.cancel).toHaveBeenCalledOnce();
			expect(mediabunnyMock.audioSources[0]?.close).toHaveBeenCalledOnce();
			expect(mediabunnyMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
		},
	);

	it("cancels and disposes after an injected finalization failure", async () => {
		const failure = new Error("Injected finalization failure.");
		mediabunnyMock.outputFinalizeFailure = failure;

		await expect(
			runSinglePassMixedAudioExportPrototype(createRequest()),
		).rejects.toBe(failure);
		expect(mediabunnyMock.conversions[0]?.cancel).not.toHaveBeenCalled();
		expect(mediabunnyMock.outputs[0]?.cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioSources[0]?.close).toHaveBeenCalledOnce();
		expect(mediabunnyMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});
});

type MockFn = ReturnType<typeof vi.fn>;

type MockInput = {
	dispose: MockFn;
};

type MockOutput = {
	addAudioTrack: MockFn;
	cancel: MockFn;
	finalize: MockFn;
	start: MockFn;
	target: { buffer: ArrayBuffer | null };
};

type MockConversionConfig = {
	audio: { discard: boolean };
	composable: boolean;
	output: MockOutput;
	trim: { end: number; start: number };
	video: Record<string, unknown>;
};

type MockConversion = {
	cancel: MockFn;
	config: MockConversionConfig;
	execute: MockFn;
};

type MockAudioSource = {
	add: MockFn;
	close: MockFn;
};

function createRequest({
	audioBuffer = {} as AudioBuffer,
	signal = new AbortController().signal,
}: {
	audioBuffer?: AudioBuffer;
	signal?: AbortSignal;
} = {}) {
	return {
		audioBuffer,
		audioCodec: "aac" as const,
		containerId: "mp4",
		mimeType: "video/mp4",
		resolution: { height: 90, width: 160 },
		selection: { endUs: 1_750_000, startUs: 250_000 },
		signal,
		source: new Blob(["source"], { type: "video/mp4" }),
		videoCodec: "avc" as const,
	};
}

async function waitForConversion() {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (mediabunnyMock.conversions.length > 0) {
			return;
		}

		await Promise.resolve();
	}

	throw new Error("Expected composable conversion to start.");
}
