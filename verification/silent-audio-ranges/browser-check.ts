import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { createDefaultAudioMix } from "../../src/editor-core/audio-mix";
import {
	type ReadyMediaAsset,
	createDefaultOutputSettings,
} from "../../src/editor-core/model";
import { resolveOutputPlan } from "../../src/editor-core/output-settings";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../../src/editor-next/export/adapters/mediabunny-output-support";
import { browserDefaultExportRunner } from "../../src/editor-next/export/runners/default-export-runner";

export async function checkExport(base64: string, start: number, mode: string) {
	const source = new Blob([
		Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
	]);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	try {
		const audio = await input.getAudioTracks();
		const asset: ReadyMediaAsset = {
			id: "silent-range-proof",
			label: "silent-ranges.mkv",
			durationUs: 6_000_000,
			provenance: {
				fileName: "silent-ranges.mkv",
				sizeBytes: source.size,
				mimeType: "video/x-matroska",
			},
			frameTiming: {
				analysis: null,
				fps: 30,
				frameDurationUs: 33_333,
				reason: "verification fixture",
				source: "estimated",
			},
			tracks: {
				audio: audio.map((track) => ({
					id: String(track.id),
					kind: "audio",
					codec: track.codec ?? undefined,
				})),
				video: [
					{ id: "1", kind: "video", codec: "avc", width: 160, height: 90 },
				],
			},
		};
		const audioMix = createDefaultAudioMix(asset);
		for (const [index, track] of audio.entries())
			audioMix.tracks[String(track.id)].include =
				mode !== "excluded" && (index === 0 || mode === "mixed");
		const outputSettings = createDefaultOutputSettings();
		if (mode === "no-audio") outputSettings.audioCodec = { kind: "no-audio" };
		try {
			const output = resolveOutputPlan({
				asset,
				audioMix,
				outputSettings,
				support: MEDIABUNNY_OUTPUT_SUPPORT,
			});
			if (output.kind === "invalid") throw new Error(output.error);
			const result = await browserDefaultExportRunner.run({
				audioMix,
				resolvedOutput: output.plan,
				selection: { startUs: start * 1e6, endUs: (start + 0.5) * 1e6 },
				signal: new AbortController().signal,
				source,
				onProgress: () => {},
			});
			const bytes = new Uint8Array(await result.blob.arrayBuffer());
			let encoded = "";
			for (const byte of bytes) encoded += String.fromCharCode(byte);
			return { ok: true, base64: btoa(encoded), mimeType: result.mimeType };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	} finally {
		input.dispose();
	}
}
