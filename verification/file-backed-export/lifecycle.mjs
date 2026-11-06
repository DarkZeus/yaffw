import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { launchBrowser } from "../browser.cjs";
import { prepareFixtures } from "./fixtures.mjs";
import { instrument } from "./instrument.mjs";
prepareFixtures();
const browser = await launchBrowser();
const results = [];
try {
	for (const scenario of ["cancel", "quota", "unavailable"]) {
		const page = await browser.newPage();
		await instrument(page, true);
		await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
		const result = await page.evaluate(async (scenario) => {
			const root = await navigator.storage.getDirectory();
			if (scenario === "quota")
				FileSystemWritableFileStream.prototype.write = async () => {
					throw new DOMException("Injected full disk", "QuotaExceededError");
				};
			if (scenario === "unavailable")
				Object.defineProperty(navigator.storage, "getDirectory", {
					value: undefined,
				});
			let failure;
			try {
				const { checkExport } = await import(
					"/verification/file-backed-export/browser-check.ts"
				);
				await checkExport({
					file: "large.mp4",
					noAudio: false,
					abortAtProcessing: scenario === "cancel",
				});
			} catch (error) {
				failure = {
					name: error.name,
					message: error.message,
					code: error.code,
				};
			}
			const remaining = [];
			for await (const [name] of root.entries())
				if (name.startsWith("yaffw-export-proof-")) remaining.push(name);
			return { scenario, failure, remaining };
		}, scenario);
		assert.ok(result.failure);
		assert.deepEqual(result.remaining, []);
		if (scenario === "cancel")
			assert.equal(result.failure.name, "DefaultExportCancelledError");
		else assert.equal(result.failure.code, scenario);
		results.push(result);
		await page.close();
		console.log(`PASS lifecycle ${scenario}`);
	}
	writeFileSync(
		"tmp/file-backed-export/lifecycle.json",
		JSON.stringify({ browser: await browser.version(), results }, null, 2),
	);
} finally {
	await browser.close();
}
