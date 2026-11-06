import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";

import { launchBrowser } from "../browser.cjs";
import { prepareAlignmentMeasurement } from "./prepare.mjs";

const {
	root,
	fixture,
	fixturePath,
	collector,
	report,
	headless,
	pilot,
	repetitions,
} = await prepareAlignmentMeasurement();
const { reportTrial, summarizeBaseline } = report;
const browser = await launchBrowser({
	headless,
});
const trials = [];
const errors = [];
const result = {
	schemaVersion: 1,
	pilot,
	measuredAt: new Date().toISOString(),
	revision: execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim(),
	mode: "live application at http://127.0.0.1:3000; no server started; no asset interception",
	measurement:
		"browser source-output estimate versus pixel-confirmed expected video display time; not physical speaker/display alignment",
	sign: "positive = audio later than video; path offset removes measured fixture bias divided by Playback speed",
	configuration: {
		browser: browser.version(),
		headless,
		os: `${os.platform()} ${os.release()} ${os.arch()}`,
		outputRoute:
			process.env.YAFFW_OUTPUT_DESCRIPTION ||
			"unverified default output; no physical route asserted",
		display:
			process.env.YAFFW_DISPLAY_DESCRIPTION ||
			"unverified; browser viewport is 1440x1000",
		builtInOrWiredPhysicalMeasurement:
			"unavailable: no calibrated microphone/photodiode capture",
		bluetoothPhysicalMeasurement:
			"unavailable: no verified Bluetooth route or calibrated capture",
	},
	fixture,
	gate: {
		minimumRepetitions: 5,
		minimumAcceptedEventsPerTrial: 7,
		eventsPerTrial: 9,
		timestampMappingSpreadLimitMs: 5,
		physicalUncertaintyMs: null,
		candidateEnablement:
			"inconclusive; physical alignment unmeasured; correction must remain disabled",
	},
	trials,
	errors,
};
try {
	for (let repetition = 1; repetition <= repetitions; repetition++) {
		// Alternate order to expose time/order bias rather than grouping rates.
		for (const rate of repetition % 2 ? [1, 0.5, 2] : [2, 0.5, 1]) {
			const context = await browser.newContext({
				viewport: { width: 1440, height: 1000 },
			});
			try {
				await context.addInitScript({ content: collector });
				const page = await context.newPage();
				page.on("pageerror", (error) => errors.push(String(error)));
				await page.goto("http://127.0.0.1:3000/");
				await page
					.locator("input[type=file]")
					.first()
					.setInputFiles(fixturePath);
				await page.waitForFunction(
					() =>
						document.querySelector("video")?.readyState >= 2 &&
						window.previewAlignmentObserver.states().length === 1,
				);
				await page.getByRole("tab", { name: "Audio", exact: true }).click();
				await page
					.locator(
						'section[aria-label="Master output meter"][data-state="ready"]',
					)
					.waitFor();
				await page
					.getByRole("combobox", { name: "Playback speed", exact: true })
					.selectOption(String(rate));
				await page.waitForFunction(
					(rate) => document.querySelector("video")?.playbackRate === rate,
					rate,
				);
				await page
					.getByRole("slider", { name: "Preview volume", exact: true })
					.fill("100");
				assert.equal(
					await page
						.getByRole("button", { name: "Mute preview audio", exact: true })
						.count(),
					1,
				);
				await page.evaluate(() => window.previewAlignmentObserver.begin());
				const transport = page.getByRole("region", {
					name: "Workbench transport region",
				});
				await transport
					.getByRole("button", { name: "Play", exact: true })
					.click();
				await transport
					.getByRole("button", { name: "Pause", exact: true })
					.waitFor();
				await page.waitForFunction(
					() => document.querySelector("video")?.currentTime >= 9.5,
					null,
					{ timeout: 35000 },
				);
				const capture = await page.evaluate(() =>
					window.previewAlignmentObserver.finish(),
				);
				await writeFile(
					"/tmp/yaffw-112-last-capture.json",
					JSON.stringify(capture, null, 2),
				);
				const report = reportTrial(capture, rate);
				await transport
					.getByRole("button", { name: "Pause", exact: true })
					.click();
				await page.getByRole("tab", { name: "Media", exact: true }).click();
				page.once("dialog", (dialog) => dialog.accept());
				await page
					.getByRole("button", { name: "Close file", exact: true })
					.click();
				await page.waitForFunction(() =>
					window.previewAlignmentObserver
						.states()
						.every((state) => state === "closed"),
				);
				trials.push({ repetition, ...report, closeReleasedContext: true });
				console.log(
					JSON.stringify({
						repetition,
						rate,
						acceptedEvents: report.acceptedEvents,
						medianMs: report.pathOffsetMs?.median,
						rejected: report.events
							.filter((event) => event.rejected)
							.map((event) => ({ id: event.id, reason: event.rejected })),
					}),
				);
			} finally {
				await context.close();
			}
		}
	}
	result.byRate = summarizeBaseline(trials);
	result.baselineCoverageGatePassed = result.byRate.every(
		(rate) => rate.coverageGatePassed,
	);
	if (!pilot)
		assert.ok(
			result.baselineCoverageGatePassed,
			"Insufficient baseline coverage: require five qualified trials at every rate",
		);
	assert.deepEqual(errors, []);
} catch (error) {
	result.failure = String(error);
	process.exitCode = 1;
} finally {
	await browser.close();
	const output =
		process.env.YAFFW_BROWSER_RESULT_PATH || "/tmp/yaffw-112-browser.json";
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(`Evidence: ${output}`);
	if (result.failure) console.error(result.failure);
}
