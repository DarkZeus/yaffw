const { collectBoundedAudioEvidence } = require("../bounded-audio-trials.cjs");
const { launchBrowser } = require("../browser.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
	const browser = await launchBrowser({
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
	try {
		const page = await browser.newPage();
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
		const result = await page.evaluate(collectBoundedAudioEvidence, {
			revision: "issue-111-working-tree",
			pollPresentation: false,
		});
		await fs.writeFile(
			"docs/verification/evidence/preview-audio-interruptions-bounded-2026-09-16.json",
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
