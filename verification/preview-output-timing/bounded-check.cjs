const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
	const browser = await chromium.launch({
		headless: true,
		executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
	try {
		const page = await browser.newPage();
		let activationCount = 0;
		await page.route(
			"**/src/editor-next/audio/engine/preview-output-timing-enabled.ts*",
			async (route) => {
				const response = await route.fetch();
				const original = await response.text();
				assert.match(original, /PREVIEW_OUTPUT_TIMING_ENABLED = false/);
				activationCount++;
				await route.fulfill({
					response,
					body: original.replace(
						"PREVIEW_OUTPUT_TIMING_ENABLED = false",
						"PREVIEW_OUTPUT_TIMING_ENABLED = true",
					),
				});
			},
		);
		await page.goto(
			"http://127.0.0.1:3000/verification/preview-audio-production/",
		);
		await page
			.locator("#fixture")
			.setInputFiles(
				process.env.YAFFW_CONTINUITY_FIXTURE || "/tmp/yaffw-111-continuous.mp4",
			);
		await page.exposeFunction("reportTrial", (n) =>
			console.log(`Completed bounded trial ${n}/5`),
		);
		const result = await page.evaluate(async () => {
			const {
				inspectProductionAudioFixture,
				prepareProductionAudioRun,
				runProductionAudioFunctionalChecks,
				evaluateProductionAudioTrials,
			} = await import(
				"/src/editor-next/audio/harness/production-audio-evidence.ts"
			);
			const { createProductionAudioProfiler, delay } = await import(
				"/src/editor-next/audio/harness/production-audio-profiler.ts"
			);
			const file = document.querySelector("#fixture").files[0];
			const { asset, fixture } = await inspectProductionAudioFixture(file);
			const functional = await runProductionAudioFunctionalChecks(
				file,
				"issue-113-output-timing-candidate",
			);
			const trials = [];
			for (let trialNumber = 1; trialNumber <= 5; trialNumber++) {
				const profiler = createProductionAudioProfiler();
				const run = await prepareProductionAudioRun(file, asset);
				const atReadiness = run.engine.getMetrics();
				const readinessStates = run.observed.getMetrics().initialTrackStates;
				const errors = [];
				let beforeCleanup;
				let observedPlaybackSeconds;
				try {
					await run.engine.play();
					const start = performance.now();
					const stalls = [
						[4, 250],
						[10, 500],
						[18, 1000],
					];
					let index = 0;
					while (performance.now() - start < 30_000) {
						if (
							stalls[index] &&
							performance.now() - start >= stalls[index][0] * 1000
						)
							profiler.stall(stalls[index++][1]);
						run.engine.getPresentationTime();
						await delay(20);
					}
					observedPlaybackSeconds = (performance.now() - start) / 1000;
					beforeCleanup = run.engine.getMetrics();
				} catch (e) {
					errors.push(String(e));
				} finally {
					run.engine.pause();
				}
				const responsiveness = profiler.stop();
				const cleanup = await run.cleanup();
				trials.push({
					trialNumber,
					readinessMs: run.readinessMs,
					readinessStates,
					observedPlaybackSeconds,
					atReadiness,
					beforeCleanup,
					responsiveness,
					cleanup,
					errors,
				});
				await window.reportTrial(trialNumber);
			}
			return {
				recordedAt: new Date().toISOString(),
				revision: "issue-113-output-timing-candidate",
				fixture,
				functional,
				trials,
				evaluation: evaluateProductionAudioTrials(trials),
				userAgent: navigator.userAgent,
				limitation:
					"New 40-second two-stereo-AAC continuous fixture; preserves existing numerical gates but is not the historical #109 controlled fixture comparison.",
			};
		});
		assert.ok(activationCount > 0, "candidate enabled by module interception");
		result.activationCount = activationCount;
		result.presentationPollingIntervalMs = 20;
		await fs.writeFile(
			"docs/verification/evidence/preview-output-bounded-2026-09-19.json",
			`${JSON.stringify(result, null, 2)}\n`,
		);
		console.log(
			JSON.stringify(
				{ functional: result.functional.passed, evaluation: result.evaluation },
				null,
				2,
			),
		);
		assert.equal(result.functional.passed, true);
		assert.equal(result.evaluation.passed, true);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
