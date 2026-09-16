const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
	const browser = await chromium.launch({ headless: true, executablePath: process.env.YAFFW_BROWSER_EXECUTABLE, args: ["--autoplay-policy=no-user-gesture-required"] });
	try {
		const page = await browser.newPage();
		await page.goto("http://127.0.0.1:3000/verification/preview-audio-production/");
		await page.locator("#fixture").setInputFiles(process.env.YAFFW_CONTINUITY_FIXTURE || "/tmp/yaffw-111-continuous.mp4");
		await page.exposeFunction("reportTrial", (n) => console.log(`Completed bounded trial ${n}/5`));
		const result = await page.evaluate(async () => {
			const { inspectProductionAudioFixture, prepareProductionAudioRun, runProductionAudioFunctionalChecks, evaluateProductionAudioTrials } = await import("/src/editor-next/audio/harness/production-audio-evidence.ts");
			const { createProductionAudioProfiler, delay } = await import("/src/editor-next/audio/harness/production-audio-profiler.ts");
			const file = document.querySelector("#fixture").files[0];
			const { asset, fixture } = await inspectProductionAudioFixture(file);
			const functional = await runProductionAudioFunctionalChecks(file, "issue-111-working-tree");
			const trials = [];
			for (let trialNumber = 1; trialNumber <= 5; trialNumber++) {
				const profiler = createProductionAudioProfiler();
				const run = await prepareProductionAudioRun(file, asset);
				const atReadiness = run.engine.getMetrics();
				const readinessStates = run.observed.getMetrics().initialTrackStates;
				const errors = [];
				let beforeCleanup, observedPlaybackSeconds;
				try {
					await run.engine.play();
					const start = performance.now();
					const stalls = [[4, 250], [10, 500], [18, 1000]];
					let index = 0;
					while (performance.now() - start < 30_000) {
						if (stalls[index] && performance.now() - start >= stalls[index][0] * 1000) profiler.stall(stalls[index++][1]);
						await delay(20);
					}
					observedPlaybackSeconds = (performance.now() - start) / 1000;
					beforeCleanup = run.engine.getMetrics();
				} catch (e) { errors.push(String(e)); } finally { run.engine.pause(); }
				const responsiveness = profiler.stop();
				const cleanup = await run.cleanup();
				trials.push({ trialNumber, readinessMs: run.readinessMs, readinessStates, observedPlaybackSeconds, atReadiness, beforeCleanup, responsiveness, cleanup, errors });
				await window.reportTrial(trialNumber);
			}
			return { recordedAt: new Date().toISOString(), revision: "issue-111-working-tree", fixture, functional, trials, evaluation: evaluateProductionAudioTrials(trials), userAgent: navigator.userAgent, limitation: "New 40-second two-stereo-AAC continuous fixture; preserves existing numerical gates but is not the historical #109 controlled fixture comparison." };
		});
		await fs.writeFile("docs/verification/evidence/preview-audio-interruptions-bounded-2026-09-16.json", `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify({ functional: result.functional.passed, evaluation: result.evaluation }, null, 2));
		assert.equal(result.functional.passed, true);
		assert.equal(result.evaluation.passed, true);
	} finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
