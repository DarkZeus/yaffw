import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { inspect } from "./artifact.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const directory = resolve("tmp/silent-audio-ranges");
const source = resolve(directory, "silent-ranges.mkv");
readFileSync(source);
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
const results = [];
try {
	for (const mode of ["mixed", "silent"]) {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			acceptDownloads: true,
		});
		page.setDefaultTimeout(30_000);
		page.setDefaultNavigationTimeout(30_000);
		page.on("console", (message) => {
			if (message.type() === "error") console.error(message.text());
		});
		const errors = [];
		page.on("pageerror", (e) => errors.push(String(e)));
		await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
		// Wait for hydration: the server-rendered input can accept files before React
		// has attached its import handler.
		await page.waitForFunction(() => {
			const input = document.querySelector('input[type="file"]');
			return (
				input &&
				Object.keys(input).some((key) => key.startsWith("__reactProps"))
			);
		});
		await page.locator("input[type=file]").first().setInputFiles(source);
		console.log("Imported fixture; awaiting waveforms");
		await page.waitForFunction(
			() =>
				document.querySelectorAll(
					'.selection-waveform-surface[data-renderer="wavesurfer"][data-sample-count="8192"]',
				).length === 2,
		);
		console.log("Waveforms ready");
		const controls = page.getByRole("region", {
			name: "Workbench transport region",
		});
		const button = (name) =>
			controls.getByRole("button", { name, exact: true });
		await button("Seek forward 1 second").click();
		await button("Seek forward 1 second").click();
		for (let n = 0; n < 6; n++) await button("Step forward one frame").click();
		await page.keyboard.press("[");
		for (let n = 0; n < 15; n++) await button("Step forward one frame").click();
		await page.keyboard.press("]");
		if (mode === "silent")
			await page
				.getByRole("button", { name: /^Exclude .* from output$/ })
				.nth(1)
				.click();
		await page.getByRole("tab", { name: "Export", exact: true }).click();
		await page
			.getByRole("button", { name: "Start export", exact: true })
			.click();
		await page
			.getByText("Export complete", { exact: true })
			.waitFor({ timeout: 60000 });
		const delivery = page.waitForEvent("download");
		await page
			.getByRole("button", { name: "Download export", exact: true })
			.click();
		const output = resolve(directory, `app-${mode}.mp4`);
		await (await delivery).saveAs(output);
		const artifact = inspect(output, true, mode === "mixed");
		await page.screenshot({ path: resolve(directory, `app-${mode}.png`) });
		await button("Step forward one frame").click();
		await page.keyboard.press("]");
		await page
			.getByRole("button", { name: "Download export", exact: true })
			.waitFor({ state: "hidden" });
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page.locator("input[type=file]").first().setInputFiles(output);
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		await page.getByText(`app-${mode}.mp4`, { exact: true }).first().waitFor();
		assert.deepEqual(errors, []);
		results.push({
			mode,
			output,
			selectionSeconds: [2.2, 2.7],
			artifact,
			explicitDownload: true,
			selectionInvalidatedDelivery: true,
			reimport: true,
			errors,
		});
		console.log(
			`PASS actual editor ${mode}, download, PCM/video, invalidation, re-import`,
		);
		await page.close();
	}
	writeFileSync(
		resolve(directory, "app.json"),
		`${JSON.stringify({ recordedAt: new Date().toISOString(), browser: await browser.version(), results }, null, 2)}\n`,
	);
} finally {
	await browser.close();
}
