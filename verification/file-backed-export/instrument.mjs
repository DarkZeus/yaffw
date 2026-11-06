import assert from "node:assert/strict";

export async function instrument(page, candidate) {
	await page.routeWebSocket("**", (socket) => socket.close());
	await page.route(
		"**/src/editor-next/export/runners/default-export-runner.ts*",
		async (route) => {
			const response = await route.fetch();
			let body = await response.text();
			const replace = (from, to) => {
				assert.equal(body.split(from).length, 2, `Unique runner seam: ${from}`);
				body = body.replace(from, to);
			};
			// Served-module instrumentation leaves the sole production runner untouched.
			if (candidate) {
				replace("  BufferTarget,", "  BufferTarget, Mp4OutputFormat,");
				body = `import { createFileBackedExportStaging, mixedAacMaximumPacketCount } from '/verification/file-backed-export/staging.ts';\n${body}`;
				replace(
					"const target = new BufferTarget();",
					`const staging = await createFileBackedExportStaging();
let succeeded = false;
scope.registerCleanup(async () => { if (!succeeded) await staging.dispose(); });
globalThis.proofStaging = staging;
const target = staging.target;`,
				);
				const format =
					/format: createMediabunnyOutputFormat\([\s\S]*?\),\s*target\b/;
				assert.equal([...body.matchAll(new RegExp(format, "g"))].length, 1);
				body = body.replace(
					format,
					'format: new Mp4OutputFormat({ fastStart: "reserve" }), target',
				);
				replace(
					'output.addAudioTrack(audioSource, { name: "Mixed audio" });',
					'output.addAudioTrack(audioSource, { name: "Mixed audio", maximumPacketCount: mixedAacMaximumPacketCount(mixedAudioOutput.audioBuffer.length) });',
				);
				replace("if (!target.buffer)", "if (false)");
				replace(
					"const mimeType = resolvedOutput.container.mimeType;",
					"const mimeType = resolvedOutput.container.mimeType; const file = await staging.finish(); succeeded = true;",
				);
				replace("new Blob([target.buffer], { type: mimeType })", "file");
			} else {
				replace(
					"const target = new BufferTarget();",
					"const target = new BufferTarget(); globalThis.proofTarget = new WeakRef(target); globalThis.proofTargetPeak = 0; target.on('write', () => { globalThis.proofTargetPeak = Math.max(globalThis.proofTargetPeak, target._buffer?.byteLength || target.buffer?.byteLength || 0); });",
				);
			}

			replace(
				"if (mixedAudio) {",
				`if (mixedAudio) {
globalThis.proofPcm = { frames: mixedAudio.length, channels: mixedAudio.numberOfChannels, sampleRate: mixedAudio.sampleRate, bytes: mixedAudio.length * mixedAudio.numberOfChannels * 4 };`,
			);
			const snapshot = `globalThis.proofReservation = output.tracks.map(t => ({ type: t.type, maximumPacketCount: t.metadata.maximumPacketCount }));
globalThis.proofMuxState = { state: output.state, fastStart: output._muxer.fastStart, counts: output._muxer.trackDatas.map(t=>({ samples:t.samples.length, chunks:t.finalizedChunks.length, queued:t.sampleQueue.length })) };
globalThis.proofMuxBytes = output._muxer.trackDatas.reduce((sum, t) => sum + t.sampleQueue.reduce((n,s)=> n + (s.data?.byteLength || 0), 0) + [...t.finalizedChunks, ...(t.currentChunk ? [t.currentChunk] : [])].reduce((n,c) => n + c.samples.reduce((m,s) => m + (s.data?.byteLength || 0), 0), 0), 0);`;
			const boundary =
				'onProgress({ completedRatio: 1, phase: "finalizing" });';
			assert.equal(body.split(boundary).length, 3);
			body = body.replaceAll(boundary, `${snapshot}\n${boundary}`);
			await route.fulfill({ response, body });
		},
	);
}
