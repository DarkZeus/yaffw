import assert from "node:assert/strict";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const browser = await launchBrowser();

function seconds(text) {
	return text
		.trim()
		.split(":")
		.reduce((sum, part) => sum * 60 + Number(part), 0);
}

async function state(root) {
	const start = root.locator('[data-handle="start"]');
	const end = root.locator('[data-handle="end"]');
	const current = {
		start: Number(await start.getAttribute("aria-valuenow")),
		end: Number(await end.getAttribute("aria-valuenow")),
		duration: Number(await end.getAttribute("aria-valuemax")),
		playhead: seconds(
			await root.locator('[data-out="timecode"]').first().textContent(),
		),
		playing: (await root.getAttribute("data-playing")) === "true",
		loop:
			(await root.locator("[data-loop]").getAttribute("aria-pressed")) ===
			"true",
	};
	for (const [name, slider, value] of [
		["start", start, current.start],
		["end", end, current.end],
	]) {
		close(
			seconds(await slider.getAttribute("aria-valuetext")),
			value,
			`Accessible ${name} time matches its slider value`,
		);
		close(
			seconds(await root.locator(`[data-out="${name}"]`).first().textContent()),
			value,
			`Visible ${name} time matches its slider value`,
		);
	}
	return current;
}

function close(actual, expected, message, tolerance = 0.003) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${message}: ${actual} vs ${expected}`,
	);
}

function valid(selection) {
	assert.ok(selection.start >= 0);
	assert.ok(selection.end <= selection.duration);
	assert.ok(selection.end - selection.start >= 1 / 30 - 0.002);
}

async function edge(page, root, name, time) {
	const timeline = await root.locator("[data-timeline]").boundingBox();
	const handle = await root.locator(`[data-handle="${name}"]`).boundingBox();
	const duration = (await state(root)).duration;
	await page.mouse.move(
		handle.x + handle.width / 2,
		handle.y + handle.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		timeline.x + (timeline.width * time) / duration,
		handle.y + handle.height / 2,
		{ steps: 5 },
	);
	await page.mouse.up();
	valid(await state(root));
}

async function seekOutside(page, root, time) {
	const timeline = await root.locator("[data-timeline]").boundingBox();
	const current = await state(root);
	assert.ok(
		time < current.start - 3 || time > current.end + 3,
		"Test seek must use space outside Selection",
	);
	await page.mouse.click(
		timeline.x + (timeline.width * time) / current.duration,
		timeline.y + timeline.height / 2,
	);
	close(
		(await state(root)).playhead,
		time,
		"Timeline click seeks the Playhead",
		0.15,
	);
}

try {
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	for (const selector of ["[data-demo]", "[data-try]"]) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			reducedMotion: "reduce",
		});
		context.setDefaultTimeout(5000);
		await context.route("https://fonts.**/*", (route) => route.abort());
		const page = await context.newPage();
		await page.clock.install({ time: new Date("2026-11-20T12:00:00Z") });
		await page.goto(origin);
		const root = page.locator(selector);
		if (selector === "[data-demo]")
			await page.locator("[data-selection-example] > summary").click();
		if (selector === "[data-try]")
			await page.locator("[data-keyboard-disclosure] > summary").click();
		await page.locator(`${selector}[data-ready]`).waitFor();
		await root.scrollIntoViewIfNeeded();
		await page.waitForFunction(
			(target) => document.querySelector(target).dataset.active === "true",
			selector,
		);
		await page.clock.pauseAt(new Date("2026-11-20T12:00:10Z"));
		const initial = await state(root);
		close(initial.start, 0, "Initial Selection starts at zero");
		close(
			initial.end,
			initial.duration,
			"Initial Selection covers the full media",
		);
		close(initial.playhead, 0, "Initial Playhead starts at zero");
		assert.equal(initial.loop, false);
		assert.equal(initial.playing, false);
		console.log(`PASS ${selector} full-range, paused, loop-off defaults`);

		await edge(page, root, "start", 12);
		await edge(page, root, "end", 22);
		let selected = await state(root);
		assert.ok(selected.start > 10 && selected.start < 14);
		assert.ok(selected.end > 20 && selected.end < 24);
		await seekOutside(page, root, 5);
		selected = await state(root);
		const body = await root.locator("[data-selection-body]").boundingBox();
		const timeline = await root.locator("[data-timeline]").boundingBox();
		await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			body.x + body.width / 2 + timeline.width * 0.1,
			body.y + body.height / 2,
			{ steps: 5 },
		);
		await page.mouse.up();
		const moved = await state(root);
		valid(moved);
		assert.ok(moved.start > selected.start + 5);
		close(
			moved.end - moved.start,
			selected.end - selected.start,
			"Selection body drag preserves length",
		);
		close(
			moved.playhead,
			selected.playhead,
			"Selection body drag preserves Playhead",
		);
		console.log(`PASS ${selector} edge gestures and range-body movement`);

		await seekOutside(page, root, moved.start - 4);
		const beforePlay = await state(root);
		await root.locator("[data-play]").click();
		close(
			(await state(root)).playhead,
			beforePlay.playhead,
			"Play outside Selection must not reset the Playhead",
		);
		await page.clock.runFor(Math.round((moved.end - moved.start + 5) * 1000));
		const crossed = await state(root);
		assert.ok(
			crossed.playhead > moved.end + 0.5,
			"Loop-off playback crosses Selection end",
		);
		assert.equal(crossed.playing, true);
		await root.locator("[data-play]").click();
		console.log(
			`PASS ${selector} outside-selection playback and loop-off crossing`,
		);

		await seekOutside(page, root, moved.start - 4);
		await root.locator("[data-loop]").click();
		assert.equal((await state(root)).loop, true);
		await root.locator("[data-play]").click();
		await page.clock.runFor(1000);
		const waiting = await state(root);
		assert.ok(
			waiting.playhead < moved.start,
			"Loop waits for playback to enter Selection",
		);
		await page.clock.runFor(Math.round((moved.end - moved.start + 6) * 1000));
		const wrapped = await state(root);
		assert.ok(
			wrapped.playhead >= moved.start && wrapped.playhead < moved.end,
			"Entered Selection loops back into its range",
		);
		assert.equal(wrapped.playing, true);
		console.log(`PASS ${selector} selection-loop entry and wrapping`);

		await root.focus();
		const beforeStep = await state(root);
		await page.keyboard.press("Shift+ArrowRight");
		const stepped = await state(root);
		assert.equal(stepped.playing, false, "Frame stepping pauses playback");
		close(
			stepped.playhead,
			beforeStep.playhead + 1 / 30,
			"Frame step advances one nominal frame",
		);
		await page.clock.runFor(1000);
		close(
			(await state(root)).playhead,
			stepped.playhead,
			"Paused frame step stays still",
		);
		await page.keyboard.press("[");
		const startSet = await state(root);
		close(
			startSet.playhead,
			stepped.playhead,
			"Setting Selection start preserves Playhead",
		);
		close(startSet.start, stepped.playhead, "Start command uses the Playhead");
		await page.keyboard.press("]");
		const endSet = await state(root);
		close(
			endSet.playhead,
			stepped.playhead,
			"Setting Selection end preserves Playhead",
		);
		valid(endSet);
		console.log(
			`PASS ${selector} paused frame stepping and valid Playhead-preserving boundary shortcuts`,
		);
		await context.close();
	}
} finally {
	await browser.close();
}
