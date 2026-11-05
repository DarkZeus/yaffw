import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { instrument } from "./instrument.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const directory = resolve("tmp/file-backed-export");
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
	args: ["--enable-precise-memory-info"],
});
const results = [];
try {
	for (
		let repetition = 0;
		repetition < Number(process.env.YAFFW_REPEATS || 2);
		repetition++
	) {
		for (const candidate of repetition % 2 ? [true, false] : [false, true]) {
			const page = await browser.newPage({ acceptDownloads: true });
			page.on("console", (message) => {
				if (message.text().startsWith("proof:")) console.log(message.text());
			});
			page.on("pageerror", (error) =>
				console.error("pageerror", error.message),
			);
			await instrument(page, candidate);
			await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
			const cdp = await page.context().newCDPSession(page);
			const samples = [];
			let sampling = true;
			let samplingError;
			const sampler = (async () => {
				while (sampling) {
					const heap = await cdp.send("Runtime.getHeapUsage");
					const state = await page.evaluate(() => ({
						phase: globalThis.proof?.phase || "analysis",
						targetBytes:
							globalThis.proofTarget?.deref()?._buffer?.byteLength ||
							globalThis.proofTarget?.deref()?.buffer?.byteLength ||
							0,
						pcm: globalThis.proofPcm,
						staging: globalThis.proofStaging?.stats,
					}));
					samples.push({ ...heap, ...state });
					if (samples.length % 200 === 0)
						console.log(
							"sampling",
							candidate,
							state.phase,
							state.targetBytes,
							heap.backingStorageSize,
						);
					await new Promise((done) => setTimeout(done, 20));
				}
			})().catch((error) => {
				samplingError = error;
			});
			try {
				const exported = await page.evaluate(async () =>
					(
						await import("/verification/file-backed-export/browser-check.ts")
					).checkExport({ file: "large.mp4", noAudio: false }),
				);
				const retained = await cdp.send("Runtime.getHeapUsage");
				const budgets = await page.evaluate(() => ({
					targetPeak: globalThis.proofTargetPeak || 0,
					muxPayloadBeforeFinalization: globalThis.proofMuxBytes,
					muxState: globalThis.proofMuxState,
					reservation: globalThis.proofReservation,
					mixedPcm: globalThis.proofPcm,
				}));
				const inspection = await page.evaluate(async () =>
					(
						await import("/verification/file-backed-export/browser-check.ts")
					).inspect(),
				);
				const afterInspection = await cdp.send("Runtime.getHeapUsage");
				await cdp.send("HeapProfiler.collectGarbage");
				const retainedAfterGc = await cdp.send("Runtime.getHeapUsage");
				const delivery = page.waitForEvent("download");
				await page.evaluate(async () =>
					(
						await import("/verification/file-backed-export/browser-check.ts")
					).deliver(),
				);
				const file = resolve(
					directory,
					`${candidate ? "file" : "buffer"}-${repetition}.mp4`,
				);
				await (await delivery).saveAs(file);
				const afterDelivery = await cdp.send("Runtime.getHeapUsage");
				assert.equal(readFileSync(file).length, exported.size);
				assert.equal(inspection.tracks.audio.length, 1);
				assert.equal(inspection.tracks.video.length, 1);
				let race = null;
				if (candidate) {
					const download = page.waitForEvent("download");
					const observed = await page.evaluate(async () =>
						(
							await import("/verification/file-backed-export/browser-check.ts")
						).deliveryRace(),
					);
					const racingDownload = await download;
					let failure = null;
					try {
						await racingDownload.saveAs(
							resolve(directory, `race-${repetition}.mp4`),
						);
					} catch (error) {
						failure = error.message;
					}
					race = {
						...observed,
						failure,
						browserFailure: await racingDownload.failure(),
					};
					assert.equal(race.readAfterDeletion, "NotFoundError");
					assert.equal(race.browserFailure, "canceled");
				}
				const staging = await page.evaluate(async () => {
					if (!globalThis.proofStaging) return null;
					const { name, stats } = globalThis.proofStaging;
					await globalThis.proofStaging.dispose();
					const root = await navigator.storage.getDirectory();
					let removed = false;
					try {
						await root.getFileHandle(name);
					} catch (error) {
						removed = error.name === "NotFoundError";
					}
					return { ...stats, removed };
				});
				if (candidate) assert.ok(staging.removed);
				assert.ok(samples.some((sample) => sample.phase === "export"));
				assert.ok(
					samples.every((sample) => Number.isFinite(sample.backingStorageSize)),
				);
				results.push({
					repetition,
					candidate,
					exported,
					budgets,
					inspection,
					retained,
					retainedAfterGc,
					afterInspection,
					afterDelivery,
					race,
					staging,
					samples,
					sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
				});
				console.log(
					`PASS ${candidate ? "file" : "buffer"} ${repetition}: ${exported.size} bytes, ${Math.round(exported.elapsedMs)}ms`,
				);
			} finally {
				sampling = false;
				await sampler;
				await page.close();
			}
			if (samplingError) throw samplingError;
			writeFileSync(
				resolve(directory, "evidence.json"),
				JSON.stringify(
					{
						browser: await browser.version(),
						recordedAt: new Date().toISOString(),
						sourceSha256: createHash("sha256")
							.update(readFileSync(resolve(directory, "large.mp4")))
							.digest("hex"),
						results,
					},
					null,
					2,
				),
			);
		}
	}
} finally {
	await browser.close();
}
