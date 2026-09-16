const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
	const browser = await chromium.launch({
		headless: true,
		executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
	});
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	const errors = [];
	const checks = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	await page.addInitScript(() => {
		const Native = window.AudioContext;
		window.__contexts = [];
		window.__events = [];
		for (const event of ["play", "playing", "pause", "seeking", "seeked", "ended"]) document.addEventListener(event, (e) => { if (e.target.tagName === "VIDEO") window.__events.push([event, e.target.currentTime, performance.now()]); }, true);
		window.AudioContext = class extends Native {
			constructor(...args) {
				super(...args);
				this.resumeMode = "allow";
				this.resumeCalls = 0;
				this.listeners = new Set();
				window.__contexts.push(this);
			}
			resume() {
				this.resumeCalls++;
				if (this.resumeMode === "reject") return Promise.reject(new DOMException("Controlled gesture rejection", "NotAllowedError"));
				if (this.resumeMode === "pending") return new Promise((resolve) => { this.finishResume = () => super.resume().then(resolve); });
				return super.resume();
			}
			addEventListener(type, listener, ...args) {
				if (type === "statechange") this.listeners.add(listener);
				return super.addEventListener(type, listener, ...args);
			}
			removeEventListener(type, listener, ...args) {
				if (type === "statechange") this.listeners.delete(listener);
				return super.removeEventListener(type, listener, ...args);
			}
		};
	});
	const controls = page.getByRole("region", { name: "Workbench transport region" });
	const button = (name) => controls.getByRole("button", { name, exact: true });
	const video = () => page.evaluate(() => ({ time: document.querySelector("video").currentTime, paused: document.querySelector("video").paused, muted: document.querySelector("video").muted }));
	async function load() {
		await page.locator("input[type=file]").first().setInputFiles(path.join(process.cwd(), "public/export-correctness-fixtures/sync-flash-click-two-audio.mp4"));
		await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2 && window.__contexts.some((c) => c.listeners.size));
	}
	async function start() {
		await button("Play").click();
		await page.waitForFunction(() => document.querySelector("video")?.paused === false);
	}
	async function interrupt(mode = "reject") {
		await page.evaluate(async (mode) => {
			const context = window.__contexts.at(-1);
			context.resumeMode = mode;
			await context.suspend();
		}, mode);
		await button("Resume audio").waitFor();
		await page.waitForFunction(() => document.querySelector("video").paused);
	}
	async function closeFile() {
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page.waitForFunction(() => window.__contexts.every((c) => c.state === "closed"));
	}
	try {
		await page.goto("http://127.0.0.1:3000/");
		await load();
		await start();
		await interrupt();
		const frozen = await video();
		const calls = await page.evaluate(() => window.__contexts.at(-1).resumeCalls);
		await page.waitForTimeout(250);
		assert.equal((await video()).time, frozen.time);
		assert.equal(frozen.muted, true);
		assert.equal(await page.evaluate(() => window.__contexts.at(-1).resumeCalls), calls);
		console.log("CHECK", checks.length + 1); checks.push("Real AudioContext.suspend freezes muted video; rejected resume exposes action without retry loop");
		await button("Seek forward 1 second").click();
		await controls.getByRole("combobox", { name: "Playback speed" }).selectOption("1.5");
		const sought = await video();
		assert.ok(sought.time >= frozen.time + 0.9);
		await page.evaluate(() => { window.__contexts.at(-1).resumeMode = "allow"; });
		await button("Resume audio").click();
		await page.waitForFunction(() => !document.querySelector("video").paused);
		await page.waitForFunction((time) => document.querySelector("video").currentTime > time + 0.15, sought.time);
		assert.equal(await page.evaluate(() => document.querySelector("video").playbackRate), 1.5);
		console.log("CHECK", checks.length + 1); checks.push("Recovery action applies latest interrupted seek and Playback speed");
		await interrupt("pending");
		await button("Pause").click();
		await page.evaluate(async () => { await window.__contexts.at(-1).finishResume(); });
		await page.waitForTimeout(150);
		assert.equal((await video()).paused, true);
		await button("Play").waitFor();
		console.log("CHECK", checks.length + 1); checks.push("Pause wins over deferred native resume");
		await page.evaluate(() => { window.__contexts.at(-1).resumeMode = "allow"; });
		await start();
		await page.evaluate(async () => { await window.__contexts.at(-1).suspend(); });
		await page.waitForFunction(() => window.__contexts.at(-1).state === "running" && !document.querySelector("video").paused);
		console.log("CHECK", checks.length + 1); checks.push("Available context resumes automatically while intent remains play");
		await interrupt();
		await page.evaluate(() => { const c = window.__contexts.at(-1); Object.defineProperty(c, "state", { configurable: true, value: "interrupted" }); c.dispatchEvent(new Event("statechange")); });
		assert.equal((await video()).paused, true);
		await page.evaluate(() => { delete window.__contexts.at(-1).state; });
		console.log("CHECK", checks.length + 1); checks.push("Simulated interrupted state retains muted stopped follower (not a real OS interruption)");
		await page.evaluate(async () => { await window.__contexts.at(-1).close(); });
		await page.getByText("Preview audio is unavailable. Close and reopen the file to restore audio.").waitFor();
		assert.equal(await button("Play").isDisabled(), true);
		console.log("CHECK", checks.length + 1); checks.push("Closed context shows unavailable state and disables Play");
		await closeFile();
		assert.equal(await page.evaluate(() => window.__contexts.every((c) => c.listeners.size === 0)), true);
		await load();
		await start();
		await interrupt("pending");
		await closeFile();
		assert.equal(await page.evaluate(() => window.__contexts.every((c) => c.listeners.size === 0)), true);
		await load();
		await start();
		console.log("CHECK", checks.length + 1); checks.push("Close file removes listeners, invalidates pending recovery, and replacement plays");
		await page.waitForFunction(() => document.querySelector("video").currentTime > 0.2);
		await button("Pause").click();
		await button("Loop selection").click();
		for (let n = 0; n < 9; n++) await button("Seek forward 1 second").click();
		await start();
		await interrupt();
		await page.evaluate(() => { window.__contexts.at(-1).resumeMode = "allow"; });
		await button("Resume audio").click();
		await page.waitForFunction(() => document.querySelector("video").currentTime < 2 && !document.querySelector("video").paused);
		checks.push("Interrupted recovery near Selection end wraps and continues playback");
		await button("Loop selection").click();
		await controls.getByRole("combobox", { name: "Playback speed" }).selectOption("2");
		await button("Play").waitFor();
		assert.equal((await video()).paused, true);
		assert.ok((await video()).time > 9.9);
		checks.push("Media end stops video and clears playback intent after recovery");
		await page.screenshot({ path: "/tmp/yaffw-111-preview.png" });
		await closeFile();
		assert.deepEqual(errors, []);
		const evidence = { recordedAt: new Date().toISOString(), browser: await browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), url: "http://127.0.0.1:3000/", checks, errors, limitations: ["Headless Chromium on macOS; AudioContext.suspend is real, resume policy rejection/pending and explicit interrupted report are controlled injections.", "OS sleep, device exclusivity, mobile Safari interruptions and physical output changes were not exercised."] };
		await fs.writeFile("docs/verification/evidence/preview-audio-interruptions-2026-09-16.json", `${JSON.stringify(evidence, null, 2)}\n`);
		console.log(JSON.stringify(evidence, null, 2));
	} catch (error) {
		await page.screenshot({ path: "/tmp/yaffw-111-failure.png" });
		console.error(await page.locator("body").innerText());
		console.error(await page.evaluate(() => ({events: window.__events, contexts: window.__contexts.map(c => ({state:c.state,time:c.currentTime,calls:c.resumeCalls})), video: document.querySelector("video")?.outerHTML})));
		throw error;
	} finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
