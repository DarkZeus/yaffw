import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
	inspectArtifact,
	inspectSource,
} from "../copy-boundaries/artifact.mjs";
import { instrument } from "./instrument.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const directory = resolve("tmp/file-backed-export");
const browser = await chromium.launch({
	headless: true,
	args: ["--autoplay-policy=no-user-gesture-required"],
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
const results = [];
try {
	for (const kind of ["cfr", "vfr", "no-audio"]) {
		const source = resolve(
			"tmp/copy-boundaries",
			`${kind === "no-audio" ? "cfr" : kind}.mp4`,
		);
		const sourceInfo = await inspectSource(source);
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			acceptDownloads: true,
		});
		await instrument(page, true);
		const downloads = [];
		page.on("download", (download) => downloads.push(download));
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
		await page.waitForFunction(
			() => document.querySelector("video")?.readyState >= 2,
		);
		await button("Play").click();
		await page
			.waitForFunction(() => document.querySelector("video")?.currentTime > 0.2)
			.catch(async (error) => {
				console.log(await page.locator("body").innerText());
				console.log(errors);
				throw error;
			});
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
		assert.equal(downloads.length, 0, "Export must not automatically download");
		const retainedStage = await page.evaluate(async () => {
			const stage = globalThis.proofStaging;
			const file = await stage.finish();
			return {
				name: stage.name,
				fileBacked: file instanceof File,
				size: file.size,
			};
		});
		assert.equal(retainedStage.fileBacked, true);
		assert.ok(retainedStage.size > 0);
		const delivery = page.waitForEvent("download");
		await page
			.getByRole("button", { name: "Download export", exact: true })
			.click();
		const output = resolve(directory, `app-${kind}.mp4`);
		await (await delivery).saveAs(output);
		const artifact = await inspectArtifact(output, sourceInfo, { start, end });
		assert.equal(artifact.audio !== null, kind !== "no-audio");
		const avEvents = (artifact.audio?.clicks ?? []).map((click) => {
			const flash = artifact.presented.flashes.find(
				(f) => Math.round(f.sourcePts) === click.sourceSecond,
			);
			const sourceFlash = sourceInfo.video.flashes.find(
				(f) => Math.round(f.pts) === click.sourceSecond,
			);
			assert.ok(flash && sourceFlash);
			const addedDeltaMs =
				(click.pts - flash.pts - (click.inferredSourcePts - sourceFlash.pts)) *
				1000;
			assert.ok(Math.abs(addedDeltaMs) < 40);
			return { sourceSecond: click.sourceSecond, addedDeltaMs };
		});
		assert.ok(kind === "no-audio" || avEvents.length >= 2);
		assert.ok(Math.abs(artifact.presented.sourceStart - start) < 0.04);
		// Best effort retains a visible tail on this VFR fixture; do not assert exactness.
		assert.ok(Math.abs(artifact.presented.sourceEnd - end) < 0.1);
		await page.screenshot({ path: resolve(directory, `app-${kind}.png`) });
		await button("Step forward one frame").click();
		await page.keyboard.press("]");
		await page
			.getByRole("button", { name: "Download export", exact: true })
			.waitFor({ state: "hidden" });
		// Deliberate verification seam: product invalidation drops its Blob reference
		// but has no staging-disposal ownership contract. Observe that limitation,
		// then explicitly dispose this proof-owned stage and verify deletion.
		const invalidationStorage = await page.evaluate(async () => {
			const stage = globalThis.proofStaging;
			const root = await navigator.storage.getDirectory();
			await root.getFileHandle(stage.name);
			await stage.dispose();
			try {
				await root.getFileHandle(stage.name);
				return { automaticallyDeleted: false, proofDeleted: false };
			} catch (error) {
				if (error.name !== "NotFoundError") throw error;
			}
			return { automaticallyDeleted: false, proofDeleted: true };
		});
		assert.equal(invalidationStorage.proofDeleted, true);
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page.locator("input[type=file]").first().setInputFiles(output);
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		await page.getByText(`app-${kind}.mp4`, { exact: true }).first().waitFor();
		await page.waitForFunction(
			() => document.querySelector("video")?.readyState >= 2,
		);
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
			avEvents,
			review,
			explicitDelivery: true,
			invalidation: true,
			closeAndReimport: true,
			reimportPlayback: true,
			errors,
			retainedStage,
			invalidationStorage,
		});
		await page.close();
		console.log(
			`PASS UI ${kind}: export, delivery, invalidation, re-import/playback`,
		);
	}
	writeFileSync(
		resolve(directory, "app-evidence.json"),
		`${JSON.stringify({ limitations: ["Candidate runner is served-module instrumentation; production source is unchanged.", "Production artifact store does not dispose OPFS staging; proof explicitly deletes staging after observing UI invalidation.", "This UI runner awaits Download completion before deletion; check.mjs separately reproduces cancellation when staging is deleted immediately after Download.", "CFR/VFR/No audio cover MP4 reserve output only; other output profiles are not proven."], recordedAt: new Date().toISOString(), browser: await browser.version(), results }, null, 2)}\n`,
	);
} finally {
	await browser.close();
}
