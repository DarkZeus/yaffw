import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { inspectArtifact, inspectSource } from "./artifact.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const directory = resolve("tmp/copy-boundaries");
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
const results = [];
try {
	for (const kind of ["cfr", "vfr", "no-audio"]) {
		const source = resolve(
			directory,
			`${kind === "no-audio" ? "cfr" : kind}.mp4`,
		);
		const sourceInfo = await inspectSource(source);
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			acceptDownloads: true,
		});
		await page.routeWebSocket("**", (socket) => socket.close());
		const errors = [];
		page.on("pageerror", (error) => errors.push(String(error)));
		await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
		await page.waitForFunction(() => {
			const input = document.querySelector('input[type="file"]');
			return (
				input &&
				Object.keys(input).some((key) => key.startsWith("__reactProps"))
			);
		});
		await page.locator("input[type=file]").first().setInputFiles(source);
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
		await button("Seek backward 10 seconds").click();
		const wholeSeconds = kind === "vfr" ? 2 : 1;
		for (let n = 0; n < wholeSeconds; n++)
			await button("Seek forward 1 second").click();
		for (let n = 0; n < 8; n++) await button("Step forward one frame").click();
		const readTime = async () => {
			const text = await page
				.getByLabel("Preview playhead time", { exact: true })
				.innerText();
			return text.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
		};
		const start = await readTime();
		await page.keyboard.press("[");
		for (let n = 0; n < 4; n++) await button("Seek forward 1 second").click();
		for (let n = 0; n < 9; n++) await button("Step forward one frame").click();
		const end = await readTime();
		await page.keyboard.press("]");
		await page.getByRole("tab", { name: "Export", exact: true }).click();
		if (kind === "no-audio") {
			await page
				.getByRole("button", { name: "Output settings", exact: true })
				.click();
			const dialog = page.getByRole("dialog");
			await dialog.getByRole("tab", { name: "Audio", exact: true }).click();
			await dialog
				.getByLabel("Audio codec", { exact: true })
				.selectOption("no-audio");
			await dialog.getByRole("button", { name: "Apply", exact: true }).click();
		}
		const review = await page
			.getByText("Boundaries unverified", { exact: true })
			.first()
			.innerText();
		await page
			.getByRole("button", { name: "Start export", exact: true })
			.click();
		await page
			.getByText("Export complete", { exact: true })
			.waitFor({ timeout: 60_000 });
		const delivery = page.waitForEvent("download");
		await page
			.getByRole("button", { name: "Download export", exact: true })
			.click();
		const output = resolve(directory, `app-${kind}.mp4`);
		await (await delivery).saveAs(output);
		const artifact = await inspectArtifact(output, sourceInfo, { start, end });
		assert.equal(artifact.audio !== null, kind !== "no-audio");
		assert.ok(Math.abs(artifact.presented.sourceStart - start) < 0.04);
		// Best effort retains a visible tail on this VFR fixture; do not assert exactness.
		assert.ok(Math.abs(artifact.presented.sourceEnd - end) < 0.1);
		await page.screenshot({ path: resolve(directory, `app-${kind}.png`) });
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
		await page.getByText(`app-${kind}.mp4`, { exact: true }).first().waitFor();
		await button("Play").click();
		await page.waitForFunction(
			() => document.querySelector("video")?.currentTime > 0.1,
		);
		await button("Pause").click();
		assert.deepEqual(errors, []);
		results.push({
			kind,
			selection: { start, end },
			artifact,
			review,
			explicitDelivery: true,
			invalidation: true,
			closeAndReimport: true,
			reimportPlayback: true,
			errors,
		});
		await page.close();
		console.log(
			`PASS UI ${kind}: export, delivery, invalidation, re-import/playback`,
		);
	}
	writeFileSync(
		resolve(directory, "app-evidence.json"),
		`${JSON.stringify({ recordedAt: new Date().toISOString(), browser: await browser.version(), results }, null, 2)}\n`,
	);
} finally {
	await browser.close();
}
