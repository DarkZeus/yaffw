import {
	EncodedAudioPacketSource,
	EncodedPacket,
	Output,
	WavOutputFormat,
} from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createFileBackedExportStaging,
	mixedAacMaximumPacketCount,
} from "../staging";

function fakeStorage(
	options: { writeError?: Error; createError?: Error } = {},
) {
	let bytes = new Uint8Array(0);
	const writable = {
		write: vi.fn(async (chunk: { position: number; data: Uint8Array }) => {
			if (options.writeError) throw options.writeError;
			if (bytes.length < chunk.position + chunk.data.length) {
				const next = new Uint8Array(chunk.position + chunk.data.length);
				next.set(bytes);
				bytes = next;
			}
			bytes.set(chunk.data, chunk.position);
		}),
		close: vi.fn(async () => {}),
		abort: vi.fn(async () => {}),
	};
	const file = { name: "result.mp4" };
	const handle = {
		createWritable: vi.fn(async () => {
			if (options.createError) throw options.createError;
			return writable;
		}),
		getFile: vi.fn(async () => file),
	};
	const root = {
		getFileHandle: vi.fn(async () => handle),
		removeEntry: vi.fn(async () => {}),
	};
	vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } });
	return { writable, root, file, handle, bytes: () => [...bytes] };
}

function createTestOutput(
	target: Awaited<ReturnType<typeof createFileBackedExportStaging>>["target"],
) {
	const source = new EncodedAudioPacketSource("pcm-u8");
	const output = new Output({ target, format: new WavOutputFormat() });
	output.addAudioTrack(source);
	return {
		output,
		async add() {
			const data = new Uint8Array(2 * 1024 * 1024).fill(123);
			await source.add(new EncodedPacket(data, "key", 0, data.length / 8000), {
				decoderConfig: {
					codec: "pcm-u8",
					sampleRate: 8000,
					numberOfChannels: 1,
				},
			});
			source.close();
		},
	};
}

afterEach(() => vi.unstubAllGlobals());

describe("proof OPFS staging", () => {
	it("writes seekable chunks, reads only a closed file, and keeps it until explicit disposal", async () => {
		const storage = fakeStorage();
		const staging = await createFileBackedExportStaging();
		await expect(staging.finish()).rejects.toThrow("Finalize");
		const { output, add } = createTestOutput(staging.target);
		await output.start();
		await add();
		await output.finalize();
		// WAV finalization rewrites its header after streaming the payload.
		expect(storage.bytes().slice(0, 4)).toEqual([82, 73, 70, 70]);
		expect(storage.bytes().at(-1)).toBe(123);
		expect(staging.stats.backpatchWrites).toBeGreaterThan(0);
		expect(staging.stats.maxWriteBytes).toBeLessThanOrEqual(1024 * 1024);
		expect(await staging.finish()).toBe(storage.file);
		expect(storage.root.removeEntry).not.toHaveBeenCalled();
		await Promise.all([staging.dispose(), staging.dispose()]);
		expect(storage.root.removeEntry).toHaveBeenCalledOnce();
		expect(storage.writable.abort).not.toHaveBeenCalled();
		await expect(staging.finish()).rejects.toThrow("Finalize");
	});

	it("aborts and removes an unfinished or unstarted artifact", async () => {
		const storage = fakeStorage();
		const staging = await createFileBackedExportStaging();
		await staging.dispose();
		expect(storage.writable.abort).toHaveBeenCalledOnce();
		expect(storage.root.removeEntry).toHaveBeenCalledWith(staging.name);
	});

	it("cleans up after target cancellation closes the writable", async () => {
		const storage = fakeStorage();
		const staging = await createFileBackedExportStaging();
		const { output } = createTestOutput(staging.target);
		await output.start();
		await output.cancel();
		await expect(staging.finish()).rejects.toThrow("Finalize");
		await staging.dispose();
		expect(storage.writable.close).toHaveBeenCalledOnce();
		expect(storage.root.removeEntry).toHaveBeenCalledOnce();
	});

	it("reports quota failure and removes a partially created file", async () => {
		const storage = fakeStorage({
			createError: new DOMException("full", "QuotaExceededError"),
		});
		await expect(createFileBackedExportStaging()).rejects.toMatchObject({
			code: "quota",
		});
		expect(storage.root.removeEntry).toHaveBeenCalledOnce();
	});

	it("can dispose after an errored target write without acquiring its locked writer", async () => {
		const storage = fakeStorage({
			writeError: new DOMException("full", "QuotaExceededError"),
		});
		const staging = await createFileBackedExportStaging();
		const { output, add } = createTestOutput(staging.target);
		await output.start();
		await expect(
			(async () => {
				await add();
				await output.finalize();
			})(),
		).rejects.toMatchObject({ code: "quota" });
		await output.cancel();
		await staging.dispose();
		expect(storage.writable.abort).toHaveBeenCalledOnce();
		expect(storage.root.removeEntry).toHaveBeenCalledOnce();
	});
});

describe("mixed AAC reservation", () => {
	it("uses sample frames with encoder headroom independently of channel count or sample rate", () => {
		expect(mixedAacMaximumPacketCount(0)).toBe(64);
		expect(mixedAacMaximumPacketCount(48_000 * 60)).toBe(4283);
		expect(mixedAacMaximumPacketCount(1025)).toBe(66);
	});
	it("rejects invalid input and reservations outside the MP4 packet limit", () => {
		for (const count of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
			expect(() => mixedAacMaximumPacketCount(count)).toThrow(RangeError);
		}
	});
});
