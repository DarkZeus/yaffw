import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const directory = resolve("tmp/waveform-gap");
const source = resolve(directory, "video-gap.mkv");
execFileSync("ffmpeg", [
	"-hide_banner",
	"-loglevel",
	"error",
	"-y",
	"-i",
	"tmp/mediabunny-upgrade/long-gop.mp4",
	"-i",
	"tmp/mediabunny-upgrade/libopus-gap.webm",
	"-map",
	"0:v",
	"-map",
	"1:a",
	"-c",
	"copy",
	"-t",
	"5.1",
	source,
]);
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
		acceptDownloads: true,
	});
	const workers = [];
	page.on("worker", (worker) => workers.push(worker.url()));
	await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
	await page.locator("input[type=file]").first().setInputFiles(source);
	await page.waitForFunction(() =>
		document.querySelector(
			'.selection-waveform-surface[data-renderer="wavesurfer"][data-sample-count="8192"]',
		),
	);
	await page.screenshot({ path: resolve(directory, "ui-after.png") });
	const controls = page.getByRole("region", {
		name: "Workbench transport region",
	});
	await controls.getByRole("button", { name: "Play", exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector("video")?.currentTime > 0.25,
	);
	await controls.getByRole("button", { name: "Pause", exact: true }).click();
	await page.getByRole("tab", { name: "Export", exact: true }).click();
	await page.getByRole("button", { name: "Start export", exact: true }).click();
	await page
		.getByText("Export complete", { exact: true })
		.waitFor({ timeout: 60000 });
	const downloaded = page.waitForEvent("download");
	await page
		.getByRole("button", { name: "Download export", exact: true })
		.click();
	const output = resolve(directory, "gap-export.mp4");
	await (await downloaded).saveAs(output);
	const probes = [1.5, 2.5, 3.5, 4.5].map((time) => {
		const bytes = execFileSync("ffmpeg", [
			"-v",
			"error",
			"-i",
			output,
			"-ss",
			String(time),
			"-t",
			"0.05",
			"-map",
			"0:a:0",
			"-ac",
			"1",
			"-f",
			"f32le",
			"-",
		]);
		let sum = 0;
		for (let offset = 0; offset < bytes.length; offset += 4)
			sum += bytes.readFloatLE(offset) ** 2;
		const rms = Math.sqrt(sum / (bytes.length / 4));
		assert.ok(
			time === 2.5 ? rms < 0.001 : rms > 0.03,
			`${time}s export RMS ${rms}`,
		);
		return { time, rms };
	});
	assert.ok(workers.some((url) => url.includes("waveform")));
	writeFileSync(
		resolve(directory, "app-evidence.json"),
		`${JSON.stringify({ recordedAt: new Date().toISOString(), browser: await browser.version(), workers, probes, screenshot: "tmp/waveform-gap/ui-after.png", source, output }, null, 2)}\n`,
	);
	console.log(
		"PASS actual editor import, ready waveform, Play/Pause, export/download, decoded gap controls",
	);
} finally {
	await browser.close();
}
