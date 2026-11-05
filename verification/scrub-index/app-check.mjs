import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
const results = [];
try {
	for (const file of [
		"long-gop.mp4",
		"sparse-cues.mkv",
		"first-cue-only.mkv",
	]) {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
		});
		await page.routeWebSocket("**", (socket) => socket.close());
		const errors = [];
		page.on("pageerror", (error) => errors.push(String(error)));
		await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
		await page.waitForFunction(() => {
			const input = document.querySelector('input[type="file"]');
			return (
				input && Object.keys(input).some((k) => k.startsWith("__reactProps"))
			);
		});
		await page
			.locator("input[type=file]")
			.first()
			.setInputFiles(resolve("tmp/scrub-index", file));
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		const controls = page.getByRole("region", {
			name: "Workbench transport region",
		});
		const button = (name) =>
			controls.getByRole("button", { name, exact: true });
		await button("Play").click();
		await page.waitForFunction(
			() => document.querySelector("video")?.currentTime > 0.2,
		);
		await button("Pause").click();
		for (let i = 0; i < 59; i++) await page.keyboard.press("l");
		await button("Step backward one frame").click();
		await page.waitForFunction(() => {
			const text =
				document.querySelector('[aria-label="Preview playhead time"]')
					?.textContent || "";
			return text.split(":").reduce((n, p) => n * 60 + Number(p), 0) > 589;
		});
		const late = await page
			.getByLabel("Preview playhead time", { exact: true })
			.innerText();
		for (const key of ["j", "l", "j", "l", "ArrowLeft", "ArrowRight"])
			await page.keyboard.press(key);
		await button("Step forward one frame").click();
		await page.waitForFunction(() => {
			const canvas = document.querySelector(
				'[data-testid="scrub-preview-canvas"]',
			);
			return canvas && canvas.width > 0 && canvas.height > 0;
		});
		const displayedFrame = await page.evaluate(
			async (base64) => {
				const harness = await import(
					"/verification/scrub-index/browser-check.ts"
				);
				return harness.checkDisplayedFrame(base64);
			},
			readFileSync(resolve("tmp/scrub-index", file)).toString("base64"),
		);
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page
			.locator("input[type=file]")
			.first()
			.setInputFiles(resolve("tmp/scrub-index/short-long-gop.mp4"));
		await button("Seek forward 10 seconds").click();
		await button("Step forward one frame").click();
		await page.waitForFunction(() => {
			const text =
				document.querySelector('[aria-label="Preview playhead time"]')
					?.textContent || "";
			return text.split(":").reduce((n, p) => n * 60 + Number(p), 0) > 9.9;
		});
		const replacementFrame = await page.evaluate(
			async (base64) => {
				const harness = await import(
					"/verification/scrub-index/browser-check.ts"
				);
				return harness.checkDisplayedFrame(base64);
			},
			readFileSync(resolve("tmp/scrub-index/short-long-gop.mp4")).toString(
				"base64",
			),
		);
		assert.deepEqual(errors, []);
		results.push({
			file,
			late,
			rapidReversal: true,
			closeAndReplacement: true,
			displayedFrame,
			replacementFrame,
			errors,
		});
		await page.close();
		console.log(`PASS UI ${file}`);
	}
	writeFileSync(
		"tmp/scrub-index/app-evidence.json",
		`${JSON.stringify({ browser: await browser.version(), results }, null, 2)}\n`,
	);
} finally {
	await browser.close();
}
