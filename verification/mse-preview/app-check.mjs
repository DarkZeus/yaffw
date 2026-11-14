import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser } from "../browser.cjs";

const [trailer, smallMp4] = process.argv.slice(2);
assert.ok(
	trailer && smallMp4,
	"Pass the paths to the original trailer and a lower-bitrate H.264 MP4.",
);
const browser = await launchBrowser({
	args: [
		"--disable-features=HardwareMediaKeyHandling,MediaSessionService",
		"--disable-background-media-suspend",
	],
});
const directory = resolve("tmp/mse-preview");
mkdirSync(directory, { recursive: true });
const report = { browser: browser.version(), errors: [], seeks: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
	page.on("pageerror", (error) => report.errors.push(error.message));
	await page.routeWebSocket("**/*", () => {});
	await page.addInitScript(() => {
		const createUrl = URL.createObjectURL.bind(URL);
		const revokeUrl = URL.revokeObjectURL.bind(URL);
		const mseUrls = new Set();
		const originalPlay = Object.getOwnPropertyDescriptor(
			HTMLMediaElement.prototype,
			"play",
		).value;
		const mutedAtPlay = [];
		URL.createObjectURL = (source) => {
			const url = createUrl(source);
			if (source instanceof MediaSource) mseUrls.add(url);
			return url;
		};
		URL.revokeObjectURL = (url) => {
			mseUrls.delete(url);
			revokeUrl(url);
		};
		HTMLVideoElement.prototype.play = function () {
			mutedAtPlay.push(this.muted);
			return originalPlay.call(this);
		};
		window.previewCheck = { mseUrls, mutedAtPlay };
	});
	await page.goto(process.env.YAFFW_ORIGIN ?? "http://127.0.0.1:3000");
	const fileInput = page.locator('input[type="file"]');
	await page.waitForFunction(() => {
		const input = document.querySelector('input[type="file"]');
		return (
			input && Object.keys(input).some((key) => key.startsWith("__reactProps"))
		);
	});
	await fileInput.setInputFiles(trailer);
	const video = page.locator("video");
	const button = (name) =>
		page.getByRole("button", { name, exact: true }).first();
	await waitForMsePreview();

	await video.evaluate((video) => {
		const stats = { lastFrame: null, waiting: 0, longestGapMs: 0 };
		let previous;
		video.addEventListener("waiting", () => {
			stats.waiting++;
		});
		const observe = (now, frame) => {
			if (!video.paused && previous !== undefined) {
				stats.longestGapMs = Math.max(stats.longestGapMs, now - previous);
			}
			previous = video.paused ? undefined : now;
			stats.lastFrame = frame.mediaTime;
			video.requestVideoFrameCallback(observe);
		};
		video.requestVideoFrameCallback(observe);
		window.previewCheck.frames = stats;
	});
	await button("Play").click();
	await page.waitForFunction(
		() => document.querySelector("video")?.currentTime > 6,
		undefined,
		{ timeout: 15_000 },
	);
	assert.ok(
		await page.evaluate(() => window.previewCheck.mutedAtPlay.includes(true)),
		"Expected the editor audio engine to own playback.",
	);

	if (process.env.YAFFW_SEEK_ONLY !== "1") {
		await page.waitForFunction(
			() => window.previewCheck.frames.lastFrame > 93.4,
			undefined,
			{ timeout: 110_000 },
		);
		await button("Play").waitFor({ timeout: 6_000 });
		report.playback = await video.evaluate((video) => ({
			...window.previewCheck.frames,
			dropped: video.getVideoPlaybackQuality().droppedVideoFrames,
			total: video.getVideoPlaybackQuality().totalVideoFrames,
			useMse: window.previewCheck.mseUrls.has(video.currentSrc),
		}));
		assert.ok(
			report.playback.useMse,
			"Expected MSE through the end of the trailer.",
		);
	} else {
		await button("Pause").click();
	}

	const seekDirections =
		process.env.YAFFW_SEEK_ONLY === "1"
			? ["forward", "forward", "backward"]
			: ["backward", "backward", "forward"];
	for (const [index, direction] of seekDirections.entries()) {
		const name = `Seek ${direction} 10 seconds`;
		await button(name).click();
		const playhead = await page
			.getByLabel("Preview playhead time", { exact: true })
			.innerText();
		const target = playhead
			.split(":")
			.reduce((time, part) => time * 60 + Number(part), 0);
		// Check the native buffer on the first two seeks before asking to play.
		// The last seek presses Play immediately into a cold buffer.
		if (index < 2)
			await page.waitForFunction(
				(target) => {
					const video = document.querySelector("video");
					return (
						video?.paused &&
						!video.seeking &&
						Math.abs(video.currentTime - target) < 0.035 &&
						Array.from(
							{ length: video.buffered.length },
							(_, index) => index,
						).some(
							(index) =>
								video.buffered.start(index) <= target + 0.005 &&
								video.buffered.end(index) > target + 0.25,
						)
					);
				},
				target,
				{ timeout: 5_000 },
			);
		await button("Play").click();
		await page.waitForFunction(
			(target) => {
				const video = document.querySelector("video");
				return (
					video &&
					!video.paused &&
					!video.seeking &&
					window.previewCheck.mseUrls.has(video.currentSrc) &&
					window.previewCheck.frames.lastFrame >= target - 0.1 &&
					window.previewCheck.frames.lastFrame < target + 0.25
				);
			},
			target,
			{ timeout: 8_000 },
		);
		report.seeks.push({
			target,
			presented: await page.evaluate(
				() => window.previewCheck.frames.lastFrame,
			),
		});
		await button("Pause").click();
	}

	page.once("dialog", (dialog) => dialog.accept());
	await button("Close file").click();
	await page.waitForFunction(() => window.previewCheck.mseUrls.size === 0);
	await fileInput.setInputFiles(smallMp4);
	await waitForMsePreview();
	assert.equal(await page.evaluate(() => window.previewCheck.mseUrls.size), 1);

	await button("Play").click();
	await page.waitForFunction(
		() => document.querySelector("video")?.currentTime > 2,
		undefined,
		{ timeout: 8_000 },
	);
	report.lowerBitrateMsePlayback = true;

	page.once("dialog", (dialog) => dialog.accept());
	await button("Close file").click();
	await page.waitForFunction(() => window.previewCheck.mseUrls.size === 0);
	await page.evaluate(() =>
		Object.defineProperty(MediaSource, "isTypeSupported", {
			configurable: true,
			value: () => false,
		}),
	);
	await fileInput.setInputFiles(smallMp4);
	await page.waitForFunction(
		() => document.querySelector("video")?.readyState >= 3,
		undefined,
		{ timeout: 10_000 },
	);
	assert.equal(await page.evaluate(() => window.previewCheck.mseUrls.size), 0);
	await button("Play").click();
	await page.waitForFunction(
		() => document.querySelector("video")?.currentTime > 2,
		undefined,
		{ timeout: 8_000 },
	);
	report.directFileFallback = true;
	assert.deepEqual(report.errors, []);
} finally {
	report.final = await page.evaluate(() => {
		const video = document.querySelector("video");
		return {
			time: video?.currentTime,
			paused: video?.paused,
			error: video?.error?.message,
			frames: window.previewCheck.frames,
			mseSources: window.previewCheck.mseUrls.size,
		};
	});
	writeFileSync(
		resolve(directory, "editor.json"),
		JSON.stringify(report, null, 2),
	);
	await browser.close();
}
console.log(JSON.stringify(report, null, 2));

async function waitForMsePreview() {
	await page.waitForFunction(
		() => {
			const video = document.querySelector("video");
			return (
				video?.readyState >= 3 &&
				window.previewCheck.mseUrls.has(video.currentSrc)
			);
		},
		undefined,
		{ timeout: 15_000 },
	);
}
