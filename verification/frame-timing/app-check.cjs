const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { launchBrowser } = require("../browser.cjs");
const baseUrl = process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000";
const names = [
	"fractional-cfr",
	"dropped-cfr",
	"vfr",
	"single-frame",
	"nonzero-start",
	"late-vfr",
];
const number = (value) => Number(value.toFixed(2)).toString();
const seconds = (time) =>
	time.split(":").reduce((total, part) => total * 60 + Number(part), 0);

async function run(browser, name) {
	console.log(`Checking ${name}`);
	const { ALL_FORMATS, BufferSource, Input } = await import("mediabunny");
	const { fixtureDirectory } = await import("./fixtures.mjs");
	const file = path.join(fixtureDirectory, `${name}.mp4`);
	const bytes = await fs.readFile(file);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BufferSource(bytes),
	});
	let metrics;
	try {
		metrics = await (
			await input.getPrimaryVideoTrack()
		).computeFrameRateMetrics({ targetPacketCount: 256 });
	} finally {
		input.dispose();
	}
	const usable = metrics.probedPacketCount >= 2;
	const fps = usable
		? (metrics.underlyingFrameRate ?? metrics.bestGuessFrameRate)
		: 30;
	const stepUs = Math.max(1, Math.round(1_000_000 / fps));
	const label = !usable
		? "30 fps fallback"
		: metrics.underlyingFrameRate === null
			? `${number(fps)} fps estimated`
			: `${number(fps)} fps${metrics.frameRateIsConstant ? "" : " · variable"}`;
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	const controls = page.getByRole("region", {
		name: "Workbench transport region",
	});
	const button = (name) => controls.getByRole("button", { name, exact: true });
	const playhead = async () =>
		seconds(
			await page
				.getByLabel("Preview playhead time", { exact: true })
				.innerText(),
		);
	const checks = [];
	try {
		await page.goto(baseUrl);
		await page.locator("input[type=file]").first().setInputFiles(file);
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		const media = page.getByLabel("Media asset context", { exact: true });
		await media.getByText(label, { exact: true }).first().waitFor();
		await page
			.locator('details[aria-label="Media analysis"] > summary')
			.click();
		const timing = page.getByRole("region", {
			name: "Frame timing analysis",
			exact: true,
		});
		const timingText = await timing.innerText();
		if (usable) {
			assert.ok(timingText.includes(`${metrics.probedPacketCount} packets`));
			assert.ok(
				timingText.includes(
					metrics.frameRateIsConstant
						? "Constant in probe"
						: "Variable in probe",
				),
			);
			assert.ok(timingText.includes("whole-file timing may differ"));
			assert.ok(
				timingText.includes("variable spacing may skip or repeat frames"),
			);
		} else assert.ok(timingText.includes("analysis unavailable"));
		checks.push(
			"Actual file import and Media compact/Analysis confidence, spacing and coverage facts",
		);
		await page.waitForFunction(
			() => document.querySelector("video")?.readyState >= 2,
		);
		const nativeDuration = await page
			.locator("video")
			.evaluate((video) => video.duration);
		// Commands clamp to the asset's media-time duration, which may differ
		// from the native element's container presentation duration.
		const duration = seconds(
			(
				await media
					.getByText("Duration", { exact: true })
					.first()
					.locator("..")
					.innerText()
			).split("\n")[1],
		);
		const initial = await playhead();
		await button("Step forward one frame").click();
		const expected = Math.min(initial + stepUs / 1_000_000, duration);
		await page.waitForFunction(
			({ expected }) => {
				const text = document.querySelector(
					'[aria-label="Preview playhead time"]',
				)?.textContent;
				const time = text
					?.split(":")
					.reduce((total, part) => total * 60 + Number(part), 0);
				return Math.abs(time - expected) < 0.0011;
			},
			{ expected },
		);
		const forward = await playhead();
		await button("Step backward one frame").click();
		assert.ok(Math.abs((await playhead()) - initial) < 0.0011);
		await button("Step backward one frame").click();
		assert.equal(await playhead(), 0);
		checks.push(
			"Nominal forward/backward frame steps match measured or fallback duration and clamp at zero",
		);
		await button("Seek forward 10 seconds").click();
		await button("Seek forward 10 seconds").click();
		await button("Seek forward 10 seconds").click();
		await button("Step forward one frame").click();
		assert.ok(
			Math.abs((await playhead()) - duration) < 0.0011,
			`${name}: endpoint ${await playhead()} vs asset duration ${duration}`,
		);
		await button("Seek backward 10 seconds").click();
		await button("Seek backward 10 seconds").click();
		await button("Seek backward 10 seconds").click();
		assert.equal(await playhead(), 0);
		checks.push("Seeking and frame steps remain within the asset duration");
		if (name === "vfr") {
			await timing.scrollIntoViewIfNeeded();
			await page.screenshot({
				path: path.join(fixtureDirectory, "vfr-analysis.png"),
			});
			await button("Seek forward 1 second").click();
			await button("Step forward one frame").click();
			const start = await playhead();
			await page.keyboard.press("[");
			await button("Seek forward 1 second").click();
			await page.keyboard.press("]");
			const end = await playhead();
			await page.getByRole("tab", { name: "Export", exact: true }).click();
			const inspector = page.getByLabel("Export inspector", { exact: true });
			assert.ok(
				(await inspector.innerText()).includes("Boundaries unverified"),
			);
			await inspector.locator("details > summary").click();
			assert.ok(!(await inspector.innerText()).includes("Proven precise"));
			await inspector
				.getByRole("button", { name: "Start export", exact: true })
				.click();
			await page
				.getByLabel("Generated media status", { exact: true })
				.waitFor({ timeout: 60000 });
			const downloadEvent = page.waitForEvent("download");
			await page
				.getByRole("button", { name: "Download export", exact: true })
				.click();
			const download = await downloadEvent;
			const output = path.join(fixtureDirectory, "vfr-generated.mp4");
			await download.saveAs(output);
			assert.ok((await fs.stat(output)).size > 0);
			checks.push(
				`Keyboard Selection [${start}, ${end}) keeps Export review best effort; real export and explicit delivery succeed`,
			);
			await page.getByRole("tab", { name: "Media", exact: true }).click();
			page.once("dialog", (dialog) => dialog.accept());
			await page
				.getByRole("button", { name: "Close file", exact: true })
				.click();
			await page.locator("input[type=file]").first().setInputFiles(output);
			await page.getByRole("tab", { name: "Media", exact: true }).click();
			assert.ok((await media.innerText()).includes("vfr-generated.mp4"));
			checks.push(
				"Delivered Generated media re-imports as a new Ready media asset",
			);
		}
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		const mediaText = await media.innerText();
		assert.equal(errors.length, 0, errors.join("\n"));
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page.locator("input[type=file]").first().waitFor();
		checks.push("Close file returns to import; no uncaught page errors");
		return {
			name,
			sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
			label,
			fps,
			stepUs,
			forwardPlayheadSeconds: forward,
			durationSeconds: duration,
			nativeDurationSeconds: nativeDuration,
			timingText,
			mediaText,
			checks,
			errors,
		};
	} finally {
		await page.close();
	}
}

(async () => {
	const { generateFixtures } = await import("./fixtures.mjs");
	generateFixtures();
	const browser = await launchBrowser();
	try {
		const runs = [];
		for (const name of names) runs.push(await run(browser, name));
		const evidence = {
			recordedAt: new Date().toISOString(),
			browser: await browser.version(),
			baseUrl,
			mediabunny: JSON.parse(
				await fs.readFile("node_modules/mediabunny/package.json", "utf8"),
			).version,
			runs,
			limitations: [
				"Headless Chromium only; no physical display or adjacent-frame guarantee.",
				"Frame timing UI and nominal transport behavior are asserted; export start/end frame precision is not inferred from this check.",
			],
		};
		const output = path.resolve(
			process.env.YAFFW_FRAME_TIMING_APP_REPORT ||
				"tmp/frame-timing/app-evidence.json",
		);
		await fs.writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
		console.log(
			JSON.stringify({
				browser: evidence.browser,
				fixtures: runs.length,
				checks: runs.reduce((count, run) => count + run.checks.length, 0),
				output,
			}),
		);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
