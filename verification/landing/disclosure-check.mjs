import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const output = resolve("tmp/landing-disclosure");
const browser = await launchBrowser();
const readings = [];
const seconds = (text) =>
	text
		.trim()
		.split(":")
		.reduce((sum, part) => sum * 60 + Number(part), 0);

async function expanded(page, expected) {
	const disclosure = page.locator("[data-keyboard-disclosure]");
	assert.equal(await disclosure.evaluate((element) => element.open), expected);
	// Playwright's inferred role tree omits a native summary containing a heading.
	// Inspect Chromium's actual accessibility tree instead of adding synthetic ARIA.
	const accessibility = await page.context().newCDPSession(page);
	try {
		const { nodes } = await accessibility.send("Accessibility.getFullAXTree");
		const control = nodes.find(
			(node) =>
				node.name?.value === "Try keyboard controls" &&
				node.properties?.some((property) => property.name === "expanded"),
		);
		assert.ok(
			control,
			"Native summary must expose its accessible expanded state",
		);
		assert.equal(
			control.properties.find((property) => property.name === "expanded").value
				.value,
			expected,
		);
	} finally {
		await accessibility.detach();
	}
	assert.equal(await page.locator("[data-try]").isVisible(), expected);
}

async function essentialContent(page) {
	assert.equal(
		await page.locator("#how").count(),
		0,
		"The duplicate three-step showcase must be integrated",
	);
	assert.equal(
		await page
			.getByRole("heading", { name: "Three steps", exact: true })
			.count(),
		0,
	);
	const workflow = await page.locator("#demo .workflow").textContent();
	for (const meaning of [
		/open|file/i,
		/selection|keep|range/i,
		/audio/i,
		/review/i,
		/export/i,
		/download/i,
	])
		assert.match(workflow, meaning);
	assert.ok(await page.locator("#demo .footnote").isVisible());
	const limits = await page.locator("#limits").textContent();
	for (const meaning of [
		/WebCodecs|Chrome|Chromium/i,
		/best effort/i,
		/memory/i,
		/refresh.*clears|refresh.*lost/i,
		/planned/i,
	])
		assert.match(limits, meaning);
	for (const href of [
		"https://mediabunny.dev/",
		"https://wavesurfer.xyz/",
		"https://ui.shadcn.com/",
		"https://tailwindcss.com/",
	])
		assert.ok(await page.locator(`#source a[href="${href}"]`).count());
	assert.equal(
		await page.locator('.footer__credit[href="https://fuad.work/"]').count(),
		1,
	);
	assert.equal(await page.locator(".cta .btn--primary").count(), 1);
	assert.ok(await page.locator("[data-demo][data-ready]").count());
}

async function collapsedFocus(page) {
	const summary = page.locator("[data-keyboard-disclosure] > summary");
	await summary.focus();
	await page.keyboard.press("Tab");
	assert.equal(
		await page.evaluate(
			() => !!document.activeElement.closest("[data-keyboard-disclosure]"),
		),
		false,
		"Closed disclosure content must not receive Tab focus",
	);
	for (const button of await page.locator("[data-try] button").all())
		assert.equal(await button.isVisible(), false);
}

try {
	await mkdir(output, { recursive: true });
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	for (const width of [1440, 390]) {
		const context = await browser.newContext({
			viewport: { width, height: 1000 },
			reducedMotion: "reduce",
		});
		context.setDefaultTimeout(5000);
		await context.route("https://fonts.**/*", (route) => route.abort());
		const page = await context.newPage();
		await page.clock.install();
		await page.goto(origin);
		await page.locator("[data-try][data-ready]").waitFor({ state: "attached" });
		assert.equal(
			await page.locator("[data-keyboard-disclosure]").count(),
			1,
			"Keyboard exploration needs a native optional disclosure",
		);
		await essentialContent(page);
		await expanded(page, false);
		readings.push({
			width,
			collapsedHeight: await page.evaluate(
				() => document.documentElement.scrollHeight,
			),
		});
		await page.locator('.footer a[href="/#shortcuts"]').click();
		assert.equal(new URL(page.url()).hash, "#shortcuts");
		assert.equal(
			await page.evaluate(() => document.activeElement.id),
			"shortcuts",
		);
		await expanded(page, false);
		await page.locator("#shortcuts").screenshot({
			path: resolve(output, `${width}-collapsed.png`),
			animations: "disabled",
		});
		await collapsedFocus(page);
		const summary = page.locator("[data-keyboard-disclosure] > summary");
		const player = page.locator("[data-try]");
		await summary.focus();
		await page.evaluate(() =>
			document.addEventListener("keydown", (event) => {
				if (event.key.toLowerCase() === "k")
					window.disclosureKeyPrevented = event.defaultPrevented;
			}),
		);
		const initial = await player
			.locator('[data-out="timecode"]')
			.first()
			.textContent();
		await page.keyboard.press("k");
		assert.equal(
			await page.evaluate(() => window.disclosureKeyPrevented),
			false,
		);
		assert.equal(await player.getAttribute("data-playing"), "false");
		assert.equal(
			await player.locator('[data-out="timecode"]').first().textContent(),
			initial,
		);
		console.log(
			`PASS ${width}px collapsed content is optional, inert and absent from Tab order`,
		);

		await page.keyboard.press("Enter");
		await expanded(page, true);
		assert.ok(await page.locator(".try__list").isVisible());
		await player.scrollIntoViewIfNeeded();
		await page.waitForFunction(
			() => document.querySelector("[data-try]").dataset.active === "true",
		);
		await page.clock.pauseAt(
			new Date((await page.evaluate(() => Date.now())) + 1000),
		);
		await player.focus();
		const before = seconds(
			await player.locator('[data-out="timecode"]').first().textContent(),
		);
		await page.keyboard.press("ArrowRight");
		const after = seconds(
			await player.locator('[data-out="timecode"]').first().textContent(),
		);
		assert.ok(
			Math.abs(after - before - 1) < 0.003,
			"Open keyboard help must drive its demo",
		);
		await page.keyboard.press("k");
		assert.equal(await player.getAttribute("data-playing"), "true");
		await page.clock.runFor(200);
		const playingTime = await player
			.locator('[data-out="timecode"]')
			.first()
			.textContent();
		const prevented = await page.evaluate(() => {
			document.querySelector("[data-keyboard-disclosure]").open = false;
			const event = new KeyboardEvent("keydown", {
				key: "k",
				bubbles: true,
				cancelable: true,
			});
			document.dispatchEvent(event);
			return event.defaultPrevented;
		});
		assert.equal(
			prevented,
			false,
			"Closing must disable shortcuts synchronously before IO/toggle delivery",
		);
		for (
			let attempt = 0;
			attempt < 50 && (await player.getAttribute("data-playing")) !== "false";
			attempt++
		)
			await delay(20);
		assert.equal(
			await player.getAttribute("data-playing"),
			"false",
			"Closing keyboard exploration stops playback",
		);
		await page.clock.runFor(1000);
		assert.equal(
			await player.locator('[data-out="timecode"]').first().textContent(),
			playingTime,
		);
		await expanded(page, false);
		console.log(
			`PASS ${width}px open shortcuts work and closing immediately relinquishes keyboard input`,
		);

		await summary.click();
		await expanded(page, true);
		await page.locator("[data-keyboard-disclosure]").screenshot({
			path: resolve(output, `${width}-expanded.png`),
			animations: "disabled",
		});
		readings.at(-1).expandedHeight = await page.evaluate(
			() => document.documentElement.scrollHeight,
		);
		await player.scrollIntoViewIfNeeded();
		const originalStart = Number(
			await player
				.locator('[data-handle="start"]')
				.getAttribute("aria-valuenow"),
		);
		const originalTime = await player
			.locator('[data-out="timecode"]')
			.first()
			.textContent();
		const handle = await player.locator('[data-handle="start"]').boundingBox();
		const timeline = await player.locator("[data-timeline]").boundingBox();
		await page.mouse.move(
			handle.x + handle.width / 2,
			handle.y + handle.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			handle.x + handle.width / 2 + timeline.width * 0.1,
			handle.y + handle.height / 2,
			{ steps: 3 },
		);
		assert.ok(
			Number(
				await player
					.locator('[data-handle="start"]')
					.getAttribute("aria-valuenow"),
			) >
				originalStart + 1,
			"The open player must show the unfinished edge draft",
		);
		await page
			.locator("[data-keyboard-disclosure]")
			.evaluate((element) => (element.open = false));
		for (
			let attempt = 0;
			attempt < 50 && (await player.getAttribute("data-dragging")) !== null;
			attempt++
		)
			await delay(20);
		await page.mouse.up();
		await summary.click();
		await expanded(page, true);
		assert.equal(await player.getAttribute("data-dragging"), null);
		assert.equal(
			Number(
				await player
					.locator('[data-handle="start"]')
					.getAttribute("aria-valuenow"),
			),
			originalStart,
			"Reopening must restore the committed Selection after a hidden unfinished gesture",
		);
		assert.equal(
			await player.locator('[data-out="timecode"]').first().textContent(),
			originalTime,
			"Canceling the hidden edge draft must restore the Playhead",
		);
		console.log(
			`PASS ${width}px closing cancels an unfinished pointer gesture`,
		);
		await summary.focus();
		await page.keyboard.press("Space");
		await expanded(page, false);
		await page.keyboard.press("Space");
		await expanded(page, true);
		await page.keyboard.press("Enter");
		await expanded(page, false);
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth + 1,
			),
			"The condensed narrative must fit the viewport",
		);
		console.log(
			`PASS ${width}px native pointer/Enter/Space activation and accessible expanded state`,
		);
		await context.close();

		const staticContext = await browser.newContext({
			viewport: { width, height: 1000 },
			javaScriptEnabled: false,
			reducedMotion: "reduce",
		});
		await staticContext.route("https://fonts.**/*", (route) => route.abort());
		const staticPage = await staticContext.newPage();
		await staticPage.goto(origin);
		await expanded(staticPage, false);
		await staticPage.locator("[data-keyboard-disclosure] > summary").focus();
		await staticPage.keyboard.press("Enter");
		await expanded(staticPage, true);
		assert.ok(await staticPage.locator(".try__list").isVisible());
		assert.ok(await staticPage.locator("[data-try] .selection").isVisible());
		assert.ok(
			await staticPage.locator("[data-try] .lane--audio svg path").count(),
		);
		for (const button of await staticPage.locator("[data-try] button").all())
			assert.ok((await button.isDisabled()) || !(await button.isVisible()));
		await staticContext.close();
		console.log(
			`PASS ${width}px no-JavaScript disclosure exposes useful static help`,
		);
	}
	await writeFile(
		resolve(output, "reading-order.json"),
		JSON.stringify(readings, null, 2),
	);
	console.log(readings);
} finally {
	await browser.close();
}
