import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const browser = await launchBrowser();

async function readable(page, selector) {
	const results = await page.locator(selector).evaluateAll((elements) =>
		elements.map((element) => {
			let visible = element.getClientRects().length > 0;
			for (let parent = element; parent; parent = parent.parentElement) {
				const style = getComputedStyle(parent);
				visible &&=
					style.display !== "none" &&
					style.visibility === "visible" &&
					Number(style.opacity) > 0.99;
			}
			return { text: element.textContent.trim(), visible };
		}),
	);
	assert.ok(results.length, `No content found for ${selector}`);
	assert.deepEqual(
		results.filter((result) => !result.visible),
		[],
		`Unreadable content: ${selector}`,
	);
}

async function staticContent(page) {
	// The independent, finite CSS hero entrance does not require JavaScript.
	// Browser rAF polling is unavailable when page JavaScript is disabled.
	for (let attempt = 0; attempt < 40; attempt++) {
		const opacity = await page
			.locator("h1")
			.evaluate((element) => Number(getComputedStyle(element).opacity));
		if (opacity === 1) break;
		await delay(50);
	}
	// Native disclosure keeps the optional help available even without scripts.
	if (
		!(await page
			.locator("[data-keyboard-disclosure]")
			.evaluate((element) => element.open))
	)
		await page.locator("[data-keyboard-disclosure] > summary").click();
	await readable(page, "h1, h2, h3, [data-reveal]");
	await readable(page, '[data-pane="0"]');
	assert.match(
		await page.locator('[data-pane="0"]').textContent(),
		/git clone[\s\S]*pnpm install[\s\S]*pnpm dev/,
	);
	for (const selector of ["[data-demo]", "[data-try]"]) {
		assert.ok(
			(await page.locator(`${selector} .lane--audio svg path`).count()) > 0,
			`${selector} needs a static waveform`,
		);
		assert.ok(
			await page.locator(`${selector} .selection`).isVisible(),
			`${selector} needs a static Selection`,
		);
	}
	const viewer = await page.locator("[data-viewer]").evaluate((element) => {
		const layers = [element, ...element.querySelectorAll("*")];
		return layers.some(
			(layer) => getComputedStyle(layer).backgroundImage !== "none",
		);
	});
	assert.ok(viewer, "The demo needs a static scene before enhancement");
	assert.ok(
		await page
			.getByRole("link", { name: "Open the editor", exact: true })
			.first()
			.isVisible(),
	);
	assert.ok(
		await page
			.getByRole("link", { name: "View source", exact: true })
			.isVisible(),
	);
}

async function controlsUnavailable(page) {
	const available = await page
		.locator("[data-demo] button, [data-try] button, [data-tab], [data-copy]")
		.evaluateAll((elements) =>
			elements
				.filter(
					(element) =>
						!element.disabled &&
						element.getClientRects().length > 0 &&
						getComputedStyle(element).visibility === "visible",
				)
				.map(
					(element) =>
						element.getAttribute("aria-label") || element.textContent.trim(),
				),
		);
	assert.deepEqual(
		available,
		[],
		"Controls must not promise unattached behavior",
	);
}

async function enhanced(page) {
	await page.locator("[data-demo][data-ready]").waitFor({ timeout: 5000 });
	await page
		.locator("[data-try][data-ready]")
		.waitFor({ state: "attached", timeout: 5000 });
	assert.ok(await page.locator('[data-tab="1"]').isVisible());
	assert.ok(await page.locator("[data-copy]").isVisible());
	const demo = page.locator("[data-demo]");
	const before = await demo
		.locator('[data-out="timecode"]')
		.first()
		.textContent();
	await demo.locator('[data-step="1"]').click();
	const after = await demo
		.locator('[data-out="timecode"]')
		.first()
		.textContent();
	assert.notEqual(after, before, "Next frame must work after initialization");
	await page.locator('[data-tab="1"]').click();
	assert.ok(await page.locator('[data-pane="1"]').isVisible());
	assert.equal(await page.locator("[data-copy]").isVisible(), false);
	await page.locator('[data-tab="0"]').click();
	assert.ok(await page.locator('[data-pane="0"]').isVisible());
	assert.ok(await page.locator("[data-copy]").isVisible());
}

async function scenario(name, options, run) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		...options,
	});
	try {
		const page = await context.newPage();
		// Third-party fonts are irrelevant to these behavior checks.
		await page.route("https://fonts.**/*", (route) => route.abort());
		await run(page, context);
		console.log(`PASS ${name}`);
	} finally {
		await context.close();
	}
}

try {
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	await scenario(
		"JavaScript disabled",
		{ javaScriptEnabled: false },
		async (page) => {
			await page.goto(origin);
			await staticContent(page);
			await controlsUnavailable(page);
		},
	);
	await scenario("Module download failed", {}, async (page) => {
		await page.route("**/*.js", (route) => route.abort("failed"));
		await page.goto(origin);
		await staticContent(page);
		await controlsUnavailable(page);
	});
	await scenario(
		"Delayed module then successful initialization",
		{},
		async (page) => {
			let release;
			const gate = new Promise((resolve) => {
				release = resolve;
			});
			await page.route("**/*.js", async (route) => {
				await gate;
				await route.continue();
			});
			await page.goto(origin, { waitUntil: "commit" });
			await page.locator('[data-pane="0"]').waitFor();
			await page.waitForFunction(() =>
				getComputedStyle(document.body).getPropertyValue("--background").trim(),
			);
			await staticContent(page);
			await controlsUnavailable(page);
			await page.locator("#demo h2").scrollIntoViewIfNeeded();
			await page.evaluate(() => {
				const title = document.querySelector("#demo h2");
				window.revealOpacity = [];
				window.stopRevealSample = false;
				const sample = () => {
					window.revealOpacity.push(Number(getComputedStyle(title).opacity));
					if (!window.stopRevealSample) requestAnimationFrame(sample);
				};
				sample();
			});
			release();
			await page.waitForLoadState("load");
			await enhanced(page);
			const opacities = await page.evaluate(() => {
				window.stopRevealSample = true;
				return window.revealOpacity;
			});
			assert.ok(opacities.length > 0);
			assert.ok(
				opacities.every((opacity) => opacity === 1),
				"Visible heading flashed out during initialization",
			);
		},
	);
	await scenario("Successful initialization", {}, async (page) => {
		await page.goto(origin);
		await enhanced(page);
	});
	await scenario(
		"Reduced motion",
		{ reducedMotion: "reduce" },
		async (page) => {
			await page.goto(origin);
			await enhanced(page);
			await page.locator("[data-keyboard-disclosure] > summary").click();
			await readable(page, "h1, h2, h3, [data-reveal]");
		},
	);
	await scenario("Observer initialization unavailable", {}, async (page) => {
		await page.addInitScript(() => {
			window.IntersectionObserver = undefined;
		});
		await page.goto(origin);
		await staticContent(page);
		const ready = await page.locator("[data-demo][data-ready]").count();
		if (ready) await enhanced(page);
		else await controlsUnavailable(page);
	});
} finally {
	await browser.close();
}
