import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { launchBrowser } from "../browser.cjs";

const file = process.argv[2];
assert.ok(file, "Pass an absolute path to the original trailer.");
const origin = process.env.YAFFW_ORIGIN ?? "http://127.0.0.1:3000";
const headless = process.env.YAFFW_HEADED !== "1";
const browser = await launchBrowser({
	headless,
	args: [
		"--disable-features=HardwareMediaKeyHandling,MediaSessionService",
		"--disable-background-media-suspend",
	],
});
const directory = resolve("tmp/mse-preview");
mkdirSync(directory, { recursive: true });
const report = {
	file: basename(file),
	browser: browser.version(),
	headless,
	errors: [],
};
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
	if (message.type() === "error") report.errors.push(message.text());
});
const cdp = await page.context().newCDPSession(page);
const mediaMessages = [];
cdp.on("Media.playerMessagesLogged", (event) => {
	mediaMessages.push(
		...event.messages.filter(
			({ level, message }) =>
				level === "error" ||
				/memory limit|Selected .*VideoDecoder/.test(message),
		),
	);
});
await cdp.send("Media.enable");

try {
	await page.routeWebSocket("**/*", () => {});
	await page.goto(`${origin}/verification/mse-preview/`);
	await page.evaluate(() => {
		const video = document.querySelector("video");
		const frameGaps = [];
		const events = [];
		let previous;
		let startedPlayback = false;
		let lastFrame = null;
		for (const name of [
			"waiting",
			"playing",
			"seeking",
			"seeked",
			"stalled",
			"pause",
			"ended",
			"error",
		]) {
			video.addEventListener(name, () =>
				events.push({
					name,
					wallMs: performance.now(),
					mediaTime: video.currentTime,
				}),
			);
		}
		function frame(now, metadata) {
			const current = {
				wallMs: now,
				mediaTime: metadata.mediaTime,
				presentedFrames: metadata.presentedFrames,
			};
			if (startedPlayback && previous && now - previous.wallMs > 100) {
				frameGaps.push({
					wallMs: now - previous.wallMs,
					from: previous.mediaTime,
					to: current.mediaTime,
				});
			}
			startedPlayback ||= !video.paused;
			previous = lastFrame = current;
			video.requestVideoFrameCallback(frame);
		}
		video.requestVideoFrameCallback(frame);
		window.snapshot = () => ({
			frameGaps,
			events,
			lastFrame,
			time: video.currentTime,
			dropped: video.getVideoPlaybackQuality().droppedVideoFrames,
			decoded: video.getVideoPlaybackQuality().totalVideoFrames,
			stats: window.msePreview,
		});
	});
	const start = Date.now();
	await page.locator("input[type=file]").setInputFiles(file);
	await page.waitForFunction(
		() =>
			document.querySelector("video").readyState >= 3 ||
			window.msePreview?.error,
		undefined,
		{ timeout: 15_000 },
	);
	assert.equal(await page.evaluate(() => window.msePreview.error), null);
	console.log(`Opened in ${Date.now() - start} ms on ${report.browser}`);
	const video = page.locator("video");

	const seekOnly = process.env.YAFFW_SEEK_ONLY === "1";
	const duration = await video.evaluate((element) => element.duration);
	if (!seekOnly) {
		await video.evaluate((element) => element.play());
		for (let second = 10; second < duration; second += 10) {
			await page.waitForFunction(
				(target) =>
					document.querySelector("video").currentTime >= target ||
					window.msePreview.error,
				second,
				{ timeout: 22_000 },
			);
			assert.equal(await page.evaluate(() => window.msePreview.error), null);
			console.log(`Played through ${second}s`);
		}
		await page.waitForFunction(
			() => document.querySelector("video").ended || window.msePreview.error,
			undefined,
			{ timeout: 22_000 },
		);
		report.playback = await page.evaluate(() => window.snapshot());
	}
	const packetLines = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_packets",
			"-show_entries",
			"packet=pts_time,size",
			"-of",
			"csv=p=0",
			file,
		],
		{ encoding: "utf8" },
	);
	const packets = packetLines
		.trim()
		.split("\n")
		.map((line) => line.split(",").map(Number));
	const bytesPerSecond = new Map();
	for (const [timestamp, bytes] of packets) {
		const second = Math.floor(timestamp);
		bytesPerSecond.set(second, (bytesPerSecond.get(second) ?? 0) + bytes);
	}
	const hotSeconds = [...bytesPerSecond]
		.filter(([second]) => second > 1 && second < duration - 1)
		.sort((left, right) => right[1] - left[1]);
	const peak = hotSeconds[0];
	const early = hotSeconds.find(
		([time]) => time < duration / 3 && time !== peak[0],
	);
	const middle = hotSeconds.find(
		([time]) =>
			time >= duration / 3 && time < (duration * 2) / 3 && time !== peak[0],
	);
	const late = hotSeconds.find(
		([time]) => time > (duration * 2) / 3 && time !== peak[0],
	);
	report.seeks = [];
	for (const [second, bytes] of [early, late, middle, peak, early]) {
		const target = second + 0.55;
		const seek = await video.evaluate(
			(element, time) =>
				new Promise((done, fail) => {
					const from = element.currentTime;
					const started = performance.now();
					const timeout = setTimeout(() => {
						element.cancelVideoFrameCallback(callback);
						fail(new Error(`No seek frame for ${time}s`));
					}, 5_000);
					let callback = element.requestVideoFrameCallback(
						function observe(_now, frame) {
							if (Math.abs(frame.mediaTime - time) > 1 / 60 + 0.00001) {
								callback = element.requestVideoFrameCallback(observe);
								return;
							}
							clearTimeout(timeout);
							done({
								from,
								target: time,
								frameTime: frame.mediaTime,
								wallMs: performance.now() - started,
							});
						},
					);
					element.currentTime = time;
				}),
			target,
		);
		report.seeks.push({ ...seek, secondBitrateMbps: (bytes * 8) / 1e6 });
		console.log("Seek", seek);
	}
	report.final = await page.evaluate(() => window.snapshot());
	assert.ok(report.final.stats.coldSeeks >= 5, "Expected five uncached seeks");
	for (const seek of report.seeks) {
		assert.ok(seek.wallMs < 1_500, "Seek took at least 1.5 seconds");
	}
	if (!seekOnly) {
		const playback = report.playback;
		assert.equal(playback.stats.verifiedVideoPackets, 5_609);
		assert.equal(playback.stats.verifiedAudioPackets, 4_384);
		const started = playback.events.find(({ name }) => name === "playing");
		const ended = playback.events.find(({ name }) => name === "ended");
		assert.equal(playback.stats.error, null);
		assert.ok(ended, "Expected natural completion");
		assert.ok(
			playback.lastFrame.mediaTime >=
				playback.stats.videoDuration - 1 / 60 - 0.00001,
			"Expected a frame at the actual end of the trailer",
		);
		assert.equal(
			playback.events.filter(({ name }) => name === "waiting").length,
			0,
			"Playback rebuffered",
		);
		assert.ok(
			playback.frameGaps.length === 0,
			"Frame presentation gaps exceeded 100 ms",
		);
		assert.ok(
			playback.dropped <= playback.decoded * 0.01,
			"Dropped more than 1% of video frames",
		);
		assert.ok(
			ended.wallMs - started.wallMs < (duration + 1) * 1000,
			"Playback exceeded real duration by more than one second",
		);
		assert.ok(
			playback.stats.maxAppendedVideoBytes <= playback.stats.videoBudget,
		);
		assert.ok(
			playback.stats.evictions > 0,
			"Expected old segments to be removed",
		);
		console.log(
			`Completed ${duration.toFixed(3)}s, ${playback.dropped}/${playback.decoded} dropped frames`,
		);
	}
} finally {
	report.final ??= await page.evaluate(() => window.snapshot?.());
	report.mediaMessages = mediaMessages;
	writeFileSync(
		resolve(
			directory,
			process.env.YAFFW_REPORT ?? (headless ? "headless.json" : "headed.json"),
		),
		JSON.stringify(report, null, 2),
	);
	await browser.close();
}
assert.deepEqual(report.errors, []);
