import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const { build } = createRequire(require.resolve("vite"))("esbuild");
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const fixture = JSON.parse(
	await readFile(path.join(directory, "fixture-manifest.json"), "utf8"),
);
const fixturePath = path.join(root, "public", fixture.url);
assert.equal(
	createHash("sha256")
		.update(await readFile(fixturePath))
		.digest("hex"),
	fixture.sha256,
);
const bundle = async (file, format) =>
	(
		await build({
			entryPoints: [path.join(directory, file)],
			bundle: true,
			write: false,
			platform: "browser",
			format,
		})
	).outputFiles[0].text;
const collector = await bundle("collector.ts", "iife");
const analysis = await bundle("report.ts", "esm");
const comparison = await bundle("comparison.ts", "esm");
const { summarizeComparison } = await import(
	`data:text/javascript;base64,${Buffer.from(comparison).toString("base64")}`
);
const { reportTrial } = await import(
	`data:text/javascript;base64,${Buffer.from(analysis).toString("base64")}`
);
const headless = process.env.YAFFW_HEADED !== "1";
const pilot = process.env.YAFFW_AV_PILOT === "1";
const repetitions = Number(process.env.YAFFW_AV_REPETITIONS || (pilot ? 1 : 5));
assert.ok(Number.isInteger(repetitions) && repetitions > 0);
const browser = await chromium.launch({
	headless,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
const sourceSnapshot = async () => {
	const files = execFileSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "-z", "src"],
		{ cwd: root, encoding: "utf8" },
	)
		.split("\0")
		.filter(Boolean)
		.sort();
	return Promise.all(
		files.map(async (file) => ({
			file,
			sha256: createHash("sha256")
				.update(await readFile(path.join(root, file)))
				.digest("hex"),
		})),
	);
};
const sourceFiles = await sourceSnapshot();
const trials = [];
const errors = [];
const result = {
	schemaVersion: 1,
	comparisonVersion: 1,
	sourceFiles,
	intervention: {
		module: "/src/editor-next/audio/engine/preview-output-timing-enabled.ts",
		baseline: false,
		candidate: true,
		otherAssetReplacement: false,
	},
	pilot,
	measuredAt: new Date().toISOString(),
	revision: execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim(),
	mode: "live application at http://127.0.0.1:3000; no server started; candidate-only enablement module interception",
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
			for (const variant of repetition % 2
				? ["baseline", "candidate"]
				: ["candidate", "baseline"]) {
				const startedAt = new Date().toISOString();
				const interventionRequests = [];
				let rawCapture = null;
				const context = await browser.newContext({
					viewport: { width: 1440, height: 1000 },
				});
				try {
					await context.route(
						"**/src/editor-next/audio/engine/preview-output-timing-enabled.ts*",
						async (route) => {
							const response = await route.fetch();
							const original = await response.text();
							const marker =
								"export const PREVIEW_OUTPUT_TIMING_ENABLED = false;";
							assert.equal(
								original.split(marker).length,
								2,
								"Expected exactly one disabled candidate export",
							);
							const body =
								variant === "candidate"
									? original.replace(
											marker,
											"export const PREVIEW_OUTPUT_TIMING_ENABLED = true;",
										)
									: original;
							interventionRequests.push({
								url: route.request().url(),
								changed: variant === "candidate",
								originalSha256: createHash("sha256")
									.update(original)
									.digest("hex"),
								deliveredSha256: createHash("sha256")
									.update(body)
									.digest("hex"),
							});
							await route.fulfill({ response, body });
						},
					);
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
						"/tmp/yaffw-113-last-capture.json",
						JSON.stringify(capture, null, 2),
					);
					rawCapture = capture;
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
					assert.ok(
						interventionRequests.length > 0,
						"Candidate module was not requested",
					);
					trials.push({
						repetition,
						variant,
						startedAt,
						finishedAt: new Date().toISOString(),
						...report,
						interventionRequests,
						closeReleasedContext: true,
					});
					console.log(
						JSON.stringify({
							repetition,
							variant,
							rate,
							acceptedEvents: report.acceptedEvents,
							medianMs: report.pathOffsetMs?.median,
							rejected: report.events
								.filter((event) => event.rejected)
								.map((event) => ({ id: event.id, reason: event.rejected })),
						}),
					);
				} catch (error) {
					trials.push({
						repetition,
						variant,
						rate,
						startedAt,
						finishedAt: new Date().toISOString(),
						failure: String(error),
						rawCapture,
						interventionRequests,
					});
					console.error(
						`${variant} ${rate} repetition ${repetition}: ${error}`,
					);
				} finally {
					await context.close();
				}
			}
		}
	}
	assert.deepEqual(
		await sourceSnapshot(),
		sourceFiles,
		"Application source changed during measurement",
	);
	result.byRate = summarizeComparison(trials);
	result.pairedCoverageGatePassed = result.byRate.every(
		(rate) => rate.coverageGatePassed,
	);
	if (!pilot)
		assert.ok(
			result.pairedCoverageGatePassed,
			"Insufficient paired coverage: require five qualified pairs at every rate",
		);
	assert.deepEqual(errors, []);
} catch (error) {
	result.failure = String(error);
	process.exitCode = 1;
} finally {
	await browser.close();
	const output =
		process.env.YAFFW_BROWSER_RESULT_PATH || "/tmp/yaffw-113-comparison.json";
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(`Evidence: ${output}`);
	if (result.failure) console.error(result.failure);
}
