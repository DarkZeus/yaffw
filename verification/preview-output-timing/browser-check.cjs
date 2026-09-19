const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const fixture = path.resolve(
	"public/export-correctness-fixtures/sync-flash-click-two-audio.mp4",
);
const url = "http://127.0.0.1:3000/";

async function run(browser, candidate, missingTimestamp = false) {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const errors = [];
	const checks = [];
	let activationCount = 0;
	page.on("pageerror", (e) => errors.push(String(e)));
	if (candidate)
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
	await page.addInitScript(
		({ missingTimestamp }) => {
			window.__audit = { contexts: [], events: [], starts: [], actions: [] };
			const Native = window.AudioContext;
			window.AudioContext = class extends Native {
				constructor(...args) {
					super(...args);
					this.rejectResume = false;
					window.__audit.contexts.push(this);
					if (missingTimestamp) this.getOutputTimestamp = undefined;
				}
				resume() {
					return this.rejectResume
						? Promise.reject(
								new DOMException("Controlled rejection", "NotAllowedError"),
							)
						: super.resume();
				}
				createBufferSource() {
					const source = super.createBufferSource();
					const start = source.start.bind(source);
					source.start = (...args) => {
						window.__audit.starts.push({
							at: performance.now(),
							contextTime: this.currentTime,
							args,
							rate: source.playbackRate.value,
							bufferDuration: source.buffer?.duration,
						});
						return start(...args);
					};
					return source;
				}
			};
			for (const event of [
				"play",
				"playing",
				"pause",
				"seeking",
				"seeked",
				"ended",
				"waiting",
				"stalled",
				"canplay",
				"loadeddata",
			])
				document.addEventListener(
					event,
					(e) => {
						if (e.target.tagName === "VIDEO")
							window.__audit.events.push({
								event,
								time: e.target.currentTime,
								at: performance.now(),
							});
					},
					true,
				);
			document.addEventListener(
				"click",
				(e) => {
					const b = e.target.closest("button");
					if (b)
						window.__audit.actions.push({
							name: b.getAttribute("aria-label"),
							at: performance.now(),
						});
				},
				true,
			);
		},
		{ missingTimestamp },
	);
	const controls = page.getByRole("region", {
		name: "Workbench transport region",
	});
	const button = (name) => controls.getByRole("button", { name, exact: true });
	const snapshot = () =>
		page.evaluate(() => {
			const v = document.querySelector("video");
			return {
				time: v.currentTime,
				paused: v.paused,
				rate: v.playbackRate,
				muted: v.muted,
			};
		});
	const load = async () => {
		await page.locator("input[type=file]").first().setInputFiles(fixture);
		await page.getByRole("tab", { name: "Audio", exact: true }).click();
		await page
			.locator('section[aria-label="Master output meter"][data-state="ready"]')
			.waitFor();
		await page.getByRole("tab", { name: "Media", exact: true }).click();
		await page.waitForFunction(
			() =>
				document.querySelector("video")?.readyState >= 2 &&
				window.__audit.contexts.length > 0,
		);
	};
	const start = async () => {
		await button("Play").click();
		await page.waitForFunction(() => !document.querySelector("video").paused);
	};
	const pause = async () => {
		await button("Pause").click();
		await page.waitForFunction(() => document.querySelector("video").paused);
	};
	const playhead = async () => {
		const text = await page
			.getByLabel("Preview playhead time", { exact: true })
			.innerText();
		return text
			.split(":")
			.reduce((seconds, part) => seconds * 60 + Number(part), 0);
	};
	const seekZero = async () => {
		await button("Seek backward 10 seconds").click();
		assert.equal(await playhead(), 0);
	};
	const close = async () => {
		page.once("dialog", (d) => d.accept());
		await page.getByRole("button", { name: "Close file", exact: true }).click();
		await page.waitForFunction(() =>
			window.__audit.contexts.every((c) => c.state === "closed"),
		);
	};
	try {
		await page.goto(url);
		await load();
		if (candidate) assert.ok(activationCount > 0, "candidate module activated");
		await start();
		await page.waitForFunction(
			() => document.querySelector("video").currentTime > 0.2,
		);
		await pause();
		const frozen = await snapshot();
		await page.waitForTimeout(150);
		assert.equal((await snapshot()).time, frozen.time);
		assert.equal(frozen.muted, true);
		checks.push("Play advances muted native follower; Pause freezes it");
		await seekZero();
		await button("Seek forward 1 second").click();
		assert.ok(Math.abs((await playhead()) - 1) < 0.01);
		await button("Step forward one frame").click();
		const stepped = await playhead();
		assert.ok(stepped > 1 && stepped < 1.05);
		await button("Step backward one frame").click();
		assert.ok(Math.abs((await playhead()) - 1) < 0.002);
		checks.push(
			"Paused seek and forward/backward frame steps preserve exact media position",
		);
		for (const rate of [0.5, 1, 2]) {
			await controls
				.getByRole("combobox", { name: "Playback speed" })
				.selectOption(String(rate));
			await start();
			const before = (await snapshot()).time;
			await page.waitForTimeout(400);
			assert.ok((await snapshot()).time > before + 0.05);
			assert.equal((await snapshot()).rate, rate);
			await pause();
		}
		checks.push(
			"Playback speed 0.5x, 1x and 2x advances and reaches native follower",
		);
		await seekZero();
		for (let i = 0; i < 2; i++) await button("Seek forward 1 second").click();
		assert.equal(await playhead(), 2);
		await page.keyboard.press("BracketLeft");
		for (let i = 0; i < 6; i++) await button("Seek forward 1 second").click();
		assert.equal(await playhead(), 8);
		await page.keyboard.press("BracketRight");
		await button("Loop selection").click();
		await button("Seek backward 10 seconds").click();
		await page.evaluate(() => {
			window.__audit.wraps = [];
			let previous = 0;
			window.__loopProbe = setInterval(() => {
				const time = document.querySelector("video").currentTime;
				if (previous > 7 && time < 3)
					window.__audit.wraps.push({ previous, time, at: performance.now() });
				previous = time;
			}, 20);
		});
		await start();
		await page.waitForFunction(() => window.__audit.wraps.length >= 3, null, {
			timeout: 18000,
		});
		await pause();
		const wraps = await page.evaluate(() => {
			clearInterval(window.__loopProbe);
			return window.__audit.wraps;
		});
		for (let i = 1; i < wraps.length; i++)
			assert.ok(
				wraps[i].at - wraps[i - 1].at > 2000,
				"no duplicate loop seeks",
			);
		checks.push(
			"Selection [2,8] repeats at 2x for at least three visible wraps without duplicate observed wraps",
		);
		await start();
		await page.evaluate(async () => {
			const c = window.__audit.contexts.at(-1);
			c.rejectResume = true;
			await c.suspend();
		});
		await button("Resume audio").waitFor();
		await page.waitForFunction(() => document.querySelector("video").paused);
		const interrupted = (await snapshot()).time;
		await page.waitForTimeout(150);
		assert.equal((await snapshot()).time, interrupted);
		await button("Seek forward 1 second").click();
		await controls
			.getByRole("combobox", { name: "Playback speed" })
			.selectOption("0.5");
		await page.evaluate(() => {
			window.__audit.contexts.at(-1).rejectResume = false;
		});
		await button("Resume audio").click();
		await page.waitForFunction(() => !document.querySelector("video").paused);
		assert.equal((await snapshot()).rate, 0.5);
		await pause();
		checks.push(
			"Real context suspension freezes follower; gesture recovery applies latest seek and rate",
		);
		await button("Loop selection").click();
		await page
			.getByRole("button", { name: "Reset selection", exact: true })
			.click();
		await controls
			.getByRole("combobox", { name: "Playback speed" })
			.selectOption("2");
		await seekZero();
		for (let i = 0; i < 9; i++) await button("Seek forward 1 second").click();
		await start();
		await button("Play").waitFor({ timeout: 5000 });
		assert.equal((await snapshot()).paused, true);
		assert.ok((await snapshot()).time > 9.9);
		checks.push("Media end stops follower and clears playback intent");
		await close();
		await load();
		await start();
		await page.waitForFunction(
			() => document.querySelector("video").currentTime > 0.15,
		);
		await pause();
		await close();
		checks.push("Close disposes contexts and replacement asset plays");
		assert.deepEqual(errors, []);
		const trace = await page.evaluate(() => ({
			events: window.__audit.events,
			starts: window.__audit.starts,
			actions: window.__audit.actions,
			contexts: window.__audit.contexts.map((c) => ({
				state: c.state,
				sampleRate: c.sampleRate,
				baseLatency: c.baseLatency,
				outputLatency: c.outputLatency,
			})),
		}));
		const pauseResponseMs = trace.actions
			.filter((a) => a.name === "Pause")
			.map(
				(a) =>
					trace.events.find((e) => e.event === "pause" && e.at >= a.at)?.at -
					a.at,
			)
			.filter(Number.isFinite);
		assert.ok(pauseResponseMs.length > 0);
		return {
			mode: candidate
				? missingTimestamp
					? "candidate-missing-timestamp"
					: "candidate"
				: "baseline",
			activationCount,
			checks,
			errors,
			pauseResponseMs,
			wraps,
			trace,
		};
	} catch (error) {
		await page.screenshot({
			path: `/tmp/yaffw-113-functional-${candidate ? "candidate" : "baseline"}-failure.png`,
		});
		console.error(await page.locator("body").innerText());
		console.error(
			JSON.stringify(
				await page.evaluate(() => ({
					audit: {
						...window.__audit,
						contexts: window.__audit.contexts.map((c) => ({
							state: c.state,
							currentTime: c.currentTime,
						})),
					},
					video: {
						time: document.querySelector("video")?.currentTime,
						paused: document.querySelector("video")?.paused,
						seeking: document.querySelector("video")?.seeking,
						readyState: document.querySelector("video")?.readyState,
						networkState: document.querySelector("video")?.networkState,
						error: document.querySelector("video")?.error?.message,
						playbackRate: document.querySelector("video")?.playbackRate,
						buffered: Array.from(
							{ length: document.querySelector("video")?.buffered.length ?? 0 },
							(_, i) => [
								document.querySelector("video").buffered.start(i),
								document.querySelector("video").buffered.end(i),
							],
						),
						playerState: (() => {
							const state = document.querySelector("media-player")?.state;
							return state
								? {
										paused: state.paused,
										playing: state.playing,
										waiting: state.waiting,
										seeking: state.seeking,
										currentTime: state.currentTime,
									}
								: null;
						})(),
					},
				})),
				null,
				2,
			),
		);
		throw error;
	} finally {
		await page.close();
	}
}
(async () => {
	const browser = await chromium.launch({
		headless: true,
		executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
	});
	try {
		const runs = [];
		for (const [candidate, missing] of [
			[false, false],
			[true, false],
			[true, true],
		]) {
			console.log("Starting", candidate, missing);
			runs.push(await run(browser, candidate, missing));
		}
		const evidence = {
			recordedAt: new Date().toISOString(),
			url,
			browser: await browser.version(),
			fixture: path.relative(process.cwd(), fixture),
			fixtureSha256: crypto
				.createHash("sha256")
				.update(await fs.readFile(fixture))
				.digest("hex"),
			runs,
			limitations: [
				"Headless Chromium with default autoplay policy; every playback start/recovery uses application controls.",
				"Candidate activated only by intercepting the dedicated disabled constant module; no source files are changed.",
				"Native suspension is real; resume rejection and unavailable getOutputTimestamp are injected.",
				"Native video seeks and PCM source starts are observed. These do not establish physical output alignment or prove source-media clipping; deterministic transport and production scheduler checks cover those invariants.",
				"Pause timings measure click capture to native pause event, excluding physical output and display latency.",
			],
		};
		await fs.writeFile(
			"docs/verification/evidence/preview-output-functional-2026-09-19.json",
			`${JSON.stringify(evidence, null, 2)}\n`,
		);
		console.log(
			JSON.stringify(
				runs.map(({ trace, ...r }) => r),
				null,
				2,
			),
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
