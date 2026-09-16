const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const liveApp = process.env.YAFFW_LIVE_APP === "1";
(async () => {
	const browser = await chromium.launch({
		headless: true,
		executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e)));
	// Fulfill the production build inside this isolated browser. No server is started.
	if (!liveApp)
		await page.route("http://127.0.0.1:3000/**", async (route) => {
			const pathname = decodeURIComponent(
				new URL(route.request().url()).pathname,
			);
			const file = path.join(
				path.join(process.cwd(), "dist"),
				pathname === "/" ? "index.html" : pathname,
			);
			try {
				await route.fulfill({
					body: await fs.readFile(file),
					contentType:
						{
							".html": "text/html",
							".js": "text/javascript",
							".css": "text/css",
							".mp4": "video/mp4",
							".json": "application/json",
							".svg": "image/svg+xml",
						}[path.extname(file)] || "application/octet-stream",
				});
			} catch {
				await route.abort();
			}
		});
	await page.addInitScript(() => {
		const Native = window.AudioContext;
		window.__audio = [];
		window.AudioContext = class extends Native {
			constructor(...args) {
				super(...args);
				window.__audio.push({ context: this, gains: [], events: [] });
			}
			createGain() {
				const gain = super.createGain();
				const record = window.__audio.find((r) => r.context === this);
				record.gains.push(gain);
				for (const method of [
					"cancelAndHoldAtTime",
					"cancelScheduledValues",
					"linearRampToValueAtTime",
					"setValueAtTime",
				]) {
					const native = gain.gain[method].bind(gain.gain);
					gain.gain[method] = (...args) => {
						record.events.push({
							node: record.gains.indexOf(gain),
							method,
							args,
							time: this.currentTime,
						});
						return native(...args);
					};
				}
				return gain;
			}
		};
	});
	try {
		await page.goto("http://127.0.0.1:3000/");
		await page
			.locator("input[type=file]")
			.first()
			.setInputFiles(
				path.join(
					process.cwd(),
					"public/export-correctness-fixtures/sync-flash-click-two-audio.mp4",
				),
			);
		await page
			.getByRole("slider", { name: "Preview volume", exact: true })
			.waitFor();
		// Visible controls can precede video initialization in the development build.
		await page.waitForFunction(
			() => document.querySelector("video")?.readyState >= 2,
		);
		const assert = require("node:assert/strict");
		await page
			.getByRole("combobox", { name: "Playback speed", exact: true })
			.selectOption("0.5");
		await page
			.getByRole("region", { name: "Workbench transport region" })
			.getByRole("button", { name: "Play", exact: true })
			.click();
		await page
			.getByRole("region", { name: "Workbench transport region" })
			.getByRole("button", { name: "Pause", exact: true })
			.waitFor();
		await page.waitForFunction(() =>
			window.__audio.some((r) => r.context.currentTime > 0.1),
		);
		const controls = page.getByRole("slider", {
			name: "Preview volume",
			exact: true,
		});
		await controls.fill("40");
		await page.waitForFunction(() =>
			window.__audio.some((r) =>
				r.events.some(
					(e) =>
						e.method === "linearRampToValueAtTime" &&
						Math.abs(e.args[0] - 0.4) < 1e-6,
				),
			),
		);
		await page
			.getByRole("button", { name: "Mute preview audio", exact: true })
			.click();
		await page.waitForFunction(() =>
			window.__audio.some((r) => r.gains[0].gain.value === 0),
		);
		assert.equal(await controls.inputValue(), "40");
		await controls.fill("70");
		assert.equal(
			await page.evaluate(() => window.__audio[0].gains[0].gain.value),
			0,
		);
		await page
			.getByRole("button", { name: "Unmute preview audio", exact: true })
			.click();
		await page.waitForFunction(
			() => Math.abs(window.__audio[0].gains[0].gain.value - 0.7) < 1e-6,
		);
		await page.getByRole("tab", { name: "Audio", exact: true }).click();
		const audioText = await page.getByRole("tabpanel").innerText();
		// Exercise the real Audio panel while the native context is running.
		const trackVolumes = page.getByRole("slider", { name: /track volume$/ });
		assert.equal(await trackVolumes.count(), 2);
		const strips = page.locator('section[aria-label^="Audio track strip "]');
		const first = strips.nth(0);
		const second = strips.nth(1);
		const eventCount = () =>
			page.evaluate(() => window.__audio[0].events.length);
		const waitTarget = async (since, target, node) => {
			await page.waitForFunction(
				({ since, target, node }) =>
					window.__audio[0].events
						.slice(since)
						.some(
							(e) =>
								e.method === "linearRampToValueAtTime" &&
								(node === undefined || e.node === node) &&
								Math.abs(e.args[0] - target) < 1e-6,
						),
				{ since, target, node },
			);
			return page.evaluate(
				({ since, target, node }) =>
					window.__audio[0].events
						.slice(since)
						.find(
							(e) =>
								e.method === "linearRampToValueAtTime" &&
								(node === undefined || e.node === node) &&
								Math.abs(e.args[0] - target) < 1e-6,
						).node,
				{ since, target, node },
			);
		};
		let since = await eventCount();
		await trackVolumes.nth(0).fill("37");
		const firstNode = await waitTarget(since, 0.37 ** 2);
		since = await eventCount();
		await trackVolumes.nth(1).fill("61");
		const secondNode = await waitTarget(since, 0.61 ** 2);
		assert.notEqual(firstNode, secondNode);
		since = await eventCount();
		await first.getByRole("button", { name: /^Exclude/ }).click();
		await waitTarget(since, 0, firstNode);
		assert.equal(await trackVolumes.nth(0).inputValue(), "37");
		// Exclusion remembers edits and solo can audition that excluded track.
		await trackVolumes.nth(0).fill("43");
		since = await eventCount();
		await first.getByRole("button", { name: /^Solo/ }).click();
		await waitTarget(since, 0.43 ** 2, firstNode);
		await waitTarget(since, 0, secondNode);
		assert.equal(
			await first
				.getByRole("button", { name: /^Include/ })
				.getAttribute("aria-pressed"),
			"false",
		);
		since = await eventCount();
		await second.getByRole("button", { name: /^Solo/ }).click();
		await waitTarget(since, 0, firstNode);
		await waitTarget(since, 0.61 ** 2, secondNode);
		await second.getByRole("button", { name: /^Clear/ }).click();
		since = await eventCount();
		await first.getByRole("button", { name: /^Include/ }).click();
		await waitTarget(since, 0.43 ** 2, firstNode);
		// Channel handling rebuilds routes; subsequent volume still targets the track.
		await first.getByRole("combobox").selectOption("average-to-mono");
		since = await eventCount();
		await trackVolumes.nth(0).fill("49");
		await waitTarget(since, 0.49 ** 2, firstNode);
		const trackChecks = {
			firstNode,
			secondNode,
			excludedSolo: true,
			rememberedVolume: true,
			routingRebuilt: true,
		};

		await page
			.getByRole("button", { name: "Mute preview audio", exact: true })
			.click();
		await page.waitForFunction(
			() => window.__audio[0].gains[0].gain.value === 0,
		);

		await page.waitForFunction(() => {
			const master = document.querySelector(
				'section[aria-label="Master output meter"]',
			);
			return (
				master?.getAttribute("data-state") === "ready" &&
				[...master.querySelectorAll("[aria-valuenow]")].some(
					(el) => Number(el.getAttribute("aria-valuenow")) > -80,
				)
			);
		});
		trackChecks.metersRemainActiveWhileGloballyMuted = true;
		await page
			.getByRole("region", { name: "Workbench transport region" })
			.getByRole("button", { name: "Pause", exact: true })
			.click();
		const before = await page.evaluate(
			() =>
				window.__audio[0].events.filter(
					(e) => e.method === "linearRampToValueAtTime",
				).length,
		);
		await page
			.getByRole("button", { name: "Unmute preview audio", exact: true })
			.click();
		await controls.fill("25");
		await page.waitForFunction(
			() => window.__audio[0].gains[0].gain.value === 0.25,
			{},
			{ timeout: 3000 },
		);
		const paused = await page.evaluate(() => ({
			gain: window.__audio[0].gains[0].gain.value,
			ramps: window.__audio[0].events.filter(
				(e) => e.method === "linearRampToValueAtTime",
			).length,
		}));
		assert.equal(paused.gain, 0.25);
		assert.equal(paused.ramps, before);
		await trackVolumes.nth(0).fill("31");
		await page.waitForFunction(
			(node) =>
				Math.abs(window.__audio[0].gains[node].gain.value - 0.31 ** 2) < 1e-6,
			firstNode,
		);
		assert.equal(
			await page.evaluate(
				() =>
					window.__audio[0].events.filter(
						(e) => e.method === "linearRampToValueAtTime",
					).length,
			),
			before,
		);
		trackChecks.pausedTrackVolumeIsImmediate = true;

		await page.getByRole("tab", { name: "Export", exact: true }).click();
		const exportText = await page.getByRole("tabpanel").innerText();
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page.waitForFunction(
			() => window.__audio[0].context.state === "closed",
		);
		await page
			.locator("input[type=file]")
			.first()
			.setInputFiles(
				path.join(
					process.cwd(),
					"public/export-correctness-fixtures/sync-flash-click-two-audio.mp4",
				),
			);
		await page
			.getByRole("slider", { name: "Preview volume", exact: true })
			.waitFor();
		await page.waitForFunction(() => window.__audio.length === 2);
		const result = {
			passed: true,
			verificationMode: liveApp
				? "live development application at http://127.0.0.1:3000; no asset interception"
				: "production build fulfilled by isolated Playwright routes; no local server started",
			audioText,
			exportText,
			paused,
			trackChecks,
			contexts: await page.evaluate(() =>
				window.__audio.map((r) => ({
					state: r.context.state,
					gain: r.gains[0].gain.value,
					events: r.events,
				})),
			),
			errors,
		};
		assert.equal(result.contexts[0].state, "closed");
		for (const node of [firstNode, secondNode]) {
			const trackEvents = result.contexts[0].events.filter(
				(e) => e.node === node,
			);
			assert.equal(
				trackEvents.filter((e) => e.method === "setValueAtTime").at(-1).args[0],
				0,
			);
			assert.ok(trackEvents.some((e) => e.method === "cancelScheduledValues"));
		}
		trackChecks.closeClearsTrackAutomation = true;

		assert.equal(
			result.contexts[0].events
				.filter((e) => e.node === 0 && e.method === "setValueAtTime")
				.at(-1).args[0],
			0,
		);
		assert.equal(
			result.contexts[0].events.filter(
				(e) => e.method === "cancelScheduledValues",
			).length > 0,
			true,
		);
		assert.equal(
			result.contexts[1].events.filter(
				(e) => e.method === "linearRampToValueAtTime",
			).length,
			0,
		);
		for (const event of result.contexts[0].events.filter(
			(e) => e.method === "linearRampToValueAtTime",
		))
			assert.ok(Math.abs(event.args[1] - event.time - 0.008) < 1e-6);
		assert.deepEqual(errors, []);
		await fs.writeFile(
			process.env.YAFFW_BROWSER_RESULT_PATH || "/tmp/yaffw-115-browser.json",
			JSON.stringify(result, null, 2) + "\n",
		);
		console.log(JSON.stringify(result, null, 2));
	} finally {
		await browser.close();
	}
	console.log({ errors });
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
