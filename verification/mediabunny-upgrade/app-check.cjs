const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launchBrowser } = require("../browser.cjs");
const origin = process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000";
const directory = path.resolve("tmp/mediabunny-app");
const original = path.resolve(
	"public/export-correctness-fixtures/sync-flash-click-two-audio.mp4",
);
function probe(file) {
	return JSON.parse(
		execFileSync("ffprobe", [
			"-v",
			"error",
			"-show_streams",
			"-show_format",
			"-of",
			"json",
			file,
		]),
	);
}
function signal(file, time) {
	const pcm = execFileSync("ffmpeg", [
		"-v",
		"error",
		"-i",
		file,
		"-ss",
		String(time),
		"-t",
		"0.04",
		"-map",
		"0:a:0",
		"-ac",
		"1",
		"-f",
		"f32le",
		"-",
	]);
	let peak = 0;
	for (let offset = 0; offset < pcm.length; offset += 4)
		peak = Math.max(peak, Math.abs(pcm.readFloatLE(offset)));
	const pixels = execFileSync("ffmpeg", [
		"-v",
		"error",
		"-i",
		file,
		"-ss",
		String(time),
		"-frames:v",
		"1",
		"-vf",
		"scale=1:1",
		"-pix_fmt",
		"gray",
		"-f",
		"rawvideo",
		"-",
	]);
	return { time, peak, luma: pixels[0] };
}
function eventAlignment(file) {
	const pcm = execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-i",
			file,
			"-map",
			"0:a:0",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-f",
			"f32le",
			"-",
		],
		{ maxBuffer: 10_000_000 },
	);
	const audio = [];
	let previousAudible = false;
	for (let offset = 0; offset < pcm.length; offset += 240 * 4) {
		let peak = 0;
		for (
			let frame = offset;
			frame < Math.min(pcm.length, offset + 240 * 4);
			frame += 4
		)
			peak = Math.max(peak, Math.abs(pcm.readFloatLE(frame)));
		const audible = peak > 0.005;
		if (audible && !previousAudible) audio.push(offset / 4 / 48000);
		previousAudible = audible;
	}
	const pixels = execFileSync("ffmpeg", [
		"-v",
		"error",
		"-i",
		file,
		"-map",
		"0:v:0",
		"-vf",
		"scale=1:1",
		"-pix_fmt",
		"gray",
		"-fps_mode",
		"passthrough",
		"-f",
		"rawvideo",
		"-",
	]);
	const frames = JSON.parse(
		execFileSync("ffprobe", [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_frames",
			"-show_entries",
			"frame=best_effort_timestamp_time",
			"-of",
			"json",
			file,
		]),
	).frames;
	assert.equal(pixels.length, frames.length);
	const video = [];
	for (let index = 0; index < pixels.length; index++)
		if (pixels[index] > 240 && (index === 0 || pixels[index - 1] <= 240))
			video.push(Number(frames[index].best_effort_timestamp_time));
	const pairs = video
		.filter((time) => time > 0.5 && time < 5.5)
		.map((videoSeconds) => {
			const audioSeconds = audio.reduce(
				(nearest, time) =>
					Math.abs(time - videoSeconds) < Math.abs(nearest - videoSeconds)
						? time
						: nearest,
				Number.POSITIVE_INFINITY,
			);
			return {
				videoSeconds,
				audioSeconds,
				deltaSeconds: audioSeconds - videoSeconds,
			};
		});
	return {
		audioOnsetsSeconds: audio,
		videoOnsetsSeconds: video,
		pairs,
		audioProbeResolutionSeconds: 0.005,
	};
}
(async () => {
	await fs.mkdir(directory, { recursive: true });
	const mkv = path.join(directory, "sync-two-audio.mkv");
	execFileSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-i",
		original,
		"-map",
		"0",
		"-c",
		"copy",
		mkv,
	]);
	const browser = await launchBrowser();
	const runs = [];
	try {
		for (const source of [original, mkv]) {
			const context = await browser.newContext({
				viewport: { width: 1440, height: 1000 },
				acceptDownloads: true,
			});
			const page = await context.newPage();
			const errors = [];
			const workers = [];
			page.on("pageerror", (error) => errors.push(String(error)));
			page.on("worker", (worker) => workers.push(worker.url()));
			await page.addInitScript(() => {
				window.__formats = [];
				const encode = AudioEncoder.prototype.encode;
				AudioEncoder.prototype.encode = function (sample) {
					if (!window.__formats.includes(sample.format))
						window.__formats.push(sample.format);
					return encode.call(this, sample);
				};
			});
			try {
				await page.goto(origin);
				await page.locator("input[type=file]").first().setInputFiles(source);
				await page.getByRole("tab", { name: "Media", exact: true }).click();
				const controls = page.getByRole("region", {
					name: "Workbench transport region",
				});
				const button = (name) =>
					controls.getByRole("button", { name, exact: true });
				await page.waitForFunction(
					() =>
						document.querySelectorAll(
							'.selection-waveform-surface[data-renderer="wavesurfer"][data-sample-count="8192"]',
						).length === 2,
				);
				await button("Play").click();
				await page.waitForFunction(
					() => document.querySelector("video")?.currentTime > 0.25,
				);
				await button("Pause").click();
				await button("Seek forward 10 seconds").click();
				await button("Step backward one frame").click();
				const latePlayhead = await page
					.getByLabel("Preview playhead time", { exact: true })
					.innerText();
				const lateSeconds = latePlayhead
					.split(":")
					.reduce((total, part) => total * 60 + Number(part), 0);
				assert.ok(lateSeconds > 9 && lateSeconds < 10.03, latePlayhead);
				await button("Seek backward 10 seconds").click();
				await button("Seek backward 10 seconds").click();
				await button("Seek forward 1 second").click();
				await button("Seek forward 1 second").click();
				await page.keyboard.press("[");
				for (let n = 0; n < 6; n++)
					await button("Seek forward 1 second").click();
				await page.keyboard.press("]");
				await page.getByRole("tab", { name: "Export", exact: true }).click();
				await page
					.getByRole("button", { name: "Start export", exact: true })
					.click();
				await page
					.getByText("Export complete", { exact: true })
					.waitFor({ timeout: 60000 });
				const event = page.waitForEvent("download");
				await page
					.getByRole("button", { name: "Download export", exact: true })
					.click();
				const output = path.join(
					directory,
					`${path.extname(source).slice(1)}-generated.mp4`,
				);
				await (await event).saveAs(output);
				const artifact = probe(output);
				assert.equal(
					artifact.streams.filter((track) => track.codec_type === "audio")
						.length,
					1,
				);
				assert.equal(
					artifact.streams.filter((track) => track.codec_type === "video")
						.length,
					1,
				);
				assert.ok(Math.abs(Number(artifact.format.duration) - 6) < 0.15);
				const alignment = eventAlignment(output);
				assert.equal(alignment.pairs.length, 5);
				for (const pair of alignment.pairs)
					assert.ok(Math.abs(pair.deltaSeconds) < 0.04, JSON.stringify(pair));
				const events = [1.05, 2.05, 3.05, 4.05, 5.05].map((time) =>
					signal(output, time),
				);
				for (const event of events) {
					// A source click peaks near 0.018; require clear signal above the
					// separately asserted <0.001 quiet floor, not a mix loudness value.
					assert.ok(event.peak > 0.01, JSON.stringify(event));
					assert.ok(event.luma > 240, JSON.stringify(event));
				}
				const quiet = signal(output, 1.5);
				assert.ok(quiet.peak < 0.001);
				assert.ok(quiet.luma < 20);
				const formats = await page.evaluate(() => window.__formats);
				assert.ok(formats.length > 0);
				assert.ok(
					workers.some((url) => url.includes("waveform")),
					JSON.stringify(workers),
				);
				await page.getByRole("tab", { name: "Media", exact: true }).click();
				page.once("dialog", (dialog) => dialog.accept());
				await page
					.getByRole("button", { name: "Close file", exact: true })
					.click();
				await page.locator("input[type=file]").first().setInputFiles(output);
				await page.getByRole("tab", { name: "Media", exact: true }).click();
				await page
					.getByText(path.basename(output), { exact: true })
					.first()
					.waitFor();
				assert.deepEqual(errors, []);
				runs.push({
					source: path.relative(process.cwd(), source),
					selectionUs: [2000000, 8000000],
					latePlayhead,
					waveformLanes: 2,
					explicitDelivery: true,
					reimport: true,
					duration: artifact.format.duration,
					streams: artifact.streams.map((track) => ({
						type: track.codec_type,
						codec: track.codec_name,
					})),
					alignment,
					events,
					quiet,
					audioEncoderInputFormats: formats,
					workers,
					errors,
				});
				console.log(
					`PASS: ${path.basename(source)} import, playback, late seek, Selection, mixed export, delivery, re-import, flash/click alignment`,
				);
			} catch (error) {
				console.error(await page.locator("body").innerText());
				throw error;
			} finally {
				await context.close();
			}
		}
		await fs.writeFile(
			path.join(directory, "evidence.json"),
			JSON.stringify(
				{
					browser: await browser.version(),
					mediabunny: JSON.parse(
						await fs.readFile("node_modules/mediabunny/package.json", "utf8"),
					).version,
					origin,
					runs,
					limitations: [
						"Synthetic short sync inputs; signal samples prove representative event alignment, not exact selected boundary frames.",
						"Encoder input format is observed; this path does not naturally change format midstream.",
					],
				},
				null,
				2,
			),
		);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
