import type { ExportBoundaryEvidence } from "../../src/editor-core/export-correctness";
import { createDefaultOutputSettings } from "../../src/editor-core/model";
import { runSelectedRangeExportArtifactHarness } from "../../src/editor-next/export/harness/export-artifact-harness";
import { EXPORT_CORRECTNESS_FIXTURES } from "../../src/editor-next/export/harness/export-correctness-fixtures";
import { browserDefaultExportRunner } from "../../src/editor-next/export/runners/default-export-runner";

export async function checkExport({
	base64,
	container,
	start,
	end,
	noAudio,
}: {
	base64: string;
	container: string;
	start: number;
	end: number;
	noAudio: boolean;
}) {
	const source = new Blob(
		[Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
		{ type: "video/mp4" },
	);
	const outputSettings = createDefaultOutputSettings();
	outputSettings.container = { kind: "documented-container", container };
	outputSettings.videoCodec = {
		kind: "documented-codec",
		codec: container === "webm" ? "vp8" : "avc",
	};
	outputSettings.audioCodec = noAudio
		? { kind: "no-audio" }
		: {
				kind: "documented-codec",
				codec: container === "webm" ? "opus" : "aac",
			};
	const selection = {
		startUs: Math.round(start * 1e6),
		endUs: Math.round(end * 1e6),
	};
	let videoEncodeCalls = 0;
	let audioEncodeCalls = 0;
	const videoEncode = VideoEncoder.prototype.encode;
	const audioEncode = AudioEncoder.prototype.encode;
	VideoEncoder.prototype.encode = function (...args) {
		videoEncodeCalls++;
		return videoEncode.apply(this, args);
	};
	AudioEncoder.prototype.encode = function (...args) {
		audioEncodeCalls++;
		return audioEncode.apply(this, args);
	};
	let elapsedMs = 0;
	let nativeEndpoints: Awaited<
		ReturnType<typeof inspectNativeEndpoints>
	> | null = null;
	let exportElapsedMs = 0;
	const began = performance.now();
	try {
		const result = await runSelectedRangeExportArtifactHarness({
			fetchFixtureBlob: async () => source,
			runner: {
				...browserDefaultExportRunner,
				run: async (request) => {
					const startedAt = performance.now();
					const result = await browserDefaultExportRunner.run(request);
					exportElapsedMs = performance.now() - startedAt;
					return result;
				},
			},
			fixture: {
				...EXPORT_CORRECTNESS_FIXTURES[1],
				id: "copy-boundary-identity",
				label: "Long-GOP B-frame identity and flash/click fixture",
				fileName: "identity.mp4",
				publicPath:
					"generated locally by verification/copy-boundaries/fixtures.mjs",
				expected: {
					durationUs: 8_000_000,
					audioTrackCount: 1,
					videoTrackCount: 1,
					mimeTypePrefix: "video/mp4",
				},
				selections: {
					full: { startUs: 0, endUs: 8_000_000 },
					selectedRange: selection,
				},
			},
			selection,
			outputSettings,
			measureBoundaryEvidence: async ({ generatedBlob }) => {
				elapsedMs = performance.now() - began;
				nativeEndpoints = await inspectNativeEndpoints(
					generatedBlob,
					container,
				);
				const bytes = new Uint8Array(await generatedBlob.arrayBuffer());
				let encoded = "";
				for (const byte of bytes) encoded += String.fromCharCode(byte);
				return (
					globalThis as unknown as {
						measureBoundary: (bytes: string) => Promise<ExportBoundaryEvidence>;
					}
				).measureBoundary(btoa(encoded));
			},
		});
		return {
			report: result.report,
			nativeEndpoints,
			exportElapsedMs,
			videoEncodeCalls,
			audioEncodeCalls,
			elapsedMs,
		};
	} finally {
		VideoEncoder.prototype.encode = videoEncode;
		AudioEncoder.prototype.encode = audioEncode;
	}
}

// Exercise Chromium's edit-list presentation independently of ffmpeg demux.
// Endpoint seeks observe the visible frame identity, not packet timestamps.
async function inspectNativeEndpoints(blob: Blob, container: string) {
	if (!["mp4", "mov", "webm"].includes(container))
		return {
			status: "not-tested",
			reason:
				"Native container playback is outside this fixture observer; independent ffmpeg presentation is recorded.",
		};
	const video = document.createElement("video");
	const url = URL.createObjectURL(blob);
	video.muted = true;
	video.preload = "auto";
	const canvas = document.createElement("canvas");
	canvas.width = 160;
	canvas.height = 96;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("No canvas context");
	function waitFor(event: string, action: () => void) {
		return new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timeout);
				video.removeEventListener(event, done);
				video.removeEventListener("error", failed);
			};
			const done = () => {
				cleanup();
				resolve();
			};
			const failed = () => {
				cleanup();
				reject(
					new Error(`Native ${container} playback: ${video.error?.message}`),
				);
			};
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error(`Native ${container} ${event} timeout`));
			}, 10000);
			video.addEventListener(event, done, { once: true });
			video.addEventListener("error", failed, { once: true });
			action();
		});
	}
	function identity() {
		context?.drawImage(video, 0, 0, 160, 96);
		const pixels = context?.getImageData(0, 0, 160, 96).data;
		if (!pixels) throw new Error("No decoded pixels");
		let id = 0;
		for (let bit = 0; bit < 12; bit++) {
			let mean = 0;
			for (let y = 6; y < 10; y++)
				for (let x = 6 + bit * 8; x < 10 + bit * 8; x++)
					mean += pixels[(y * 160 + x) * 4];
			mean /= 16;
			if (mean > 80 && mean < 168) throw new Error("Ambiguous native identity");
			if (mean >= 124) id |= 1 << bit;
		}
		return id;
	}
	try {
		await waitFor("loadeddata", () => {
			video.src = url;
		});
		const firstId = identity();
		const duration = video.duration;
		await waitFor("seeked", () => {
			video.currentTime = Math.max(0, duration - 0.00001);
		});
		return { status: "observed", duration, firstId, lastId: identity() };
	} finally {
		video.removeAttribute("src");
		video.load();
		URL.revokeObjectURL(url);
	}
}
