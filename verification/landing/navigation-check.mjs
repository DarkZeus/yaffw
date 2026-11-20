import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const browser = await launchBrowser();

async function section(page, id, { focused = true } = {}) {
	let result;
	let previousTop;
	let settledSamples = 0;
	// Host polling also works with page JavaScript disabled and during native scrolling.
	for (let attempt = 0; attempt < 100; attempt++) {
		result = await page.evaluate((targetId) => {
			const target = document.getElementById(targetId);
			return {
				hash: location.hash,
				focused: document.activeElement === target,
				top: target?.getBoundingClientRect().top,
				offset: Number.parseFloat(
					getComputedStyle(document.documentElement).scrollPaddingTop,
				),
				headerBottom: document
					.querySelector(".nav__inner")
					.getBoundingClientRect().bottom,
			};
		}, id);
		const atDestination =
			result.hash === `#${id}` &&
			(!focused || result.focused) &&
			result.top >= result.headerBottom - 1 &&
			Math.abs(result.top - result.offset) <= 1;
		// A smooth scroll can cross the expected pixel before finishing. History
		// snapshots taken at that instant restore an intermediate scroll offset.
		// Require the same correct resting position before issuing another action.
		settledSamples =
			atDestination && result.top === previousTop ? settledSamples + 1 : 0;
		if (settledSamples >= 2) return;
		previousTop = result.top;
		await delay(50);
	}
	assert.fail(
		`Native #${id} navigation did not settle: ${JSON.stringify(result)}`,
	);
}

async function scenario(name, options, run) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		...options,
	});
	context.setDefaultTimeout(5000);
	try {
		await context.route("https://fonts.**/*", (route) => route.abort());
		const page = await context.newPage();
		await run(page, context);
		console.log(`PASS ${name}`);
	} finally {
		await context.close();
	}
}

try {
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	await scenario(
		"Stale fragments and native section history",
		{},
		async (page) => {
			await page.goto(`${origin}/#source`);
			await page.locator("[data-demo][data-ready]").waitFor({ timeout: 5000 });
			await page
				.locator(".nav__links")
				.getByRole("link", { name: "Features", exact: true })
				.click();
			await section(page, "features");
			await page
				.locator(".nav__links")
				.getByRole("link", { name: "Source", exact: true })
				.click();
			await section(page, "source");
			await page.goBack();
			await section(page, "features", { focused: false });
			await page.goForward();
			await section(page, "source", { focused: false });
		},
	);

	for (const { name, options, brokenStorage } of [
		{ name: "normal JavaScript", options: {}, brokenStorage: false },
		{
			name: "disabled JavaScript",
			options: { javaScriptEnabled: false },
			brokenStorage: false,
		},
		{ name: "unavailable session storage", options: {}, brokenStorage: true },
	]) {
		await scenario(
			`Cross-page header/footer links with ${name}`,
			options,
			async (page) => {
				const errors = [];
				page.on("pageerror", (error) => errors.push(error.message));
				if (brokenStorage)
					await page.addInitScript(() => {
						Object.defineProperty(window, "sessionStorage", {
							get() {
								throw new DOMException("Storage unavailable", "SecurityError");
							},
						});
					});
				for (const path of ["/changelog/", "/404.html"]) {
					await page.goto(new URL(path, origin).href);
					await page
						.locator(".nav__links")
						.getByRole("link", { name: "Features", exact: true })
						.click();
					await section(page, "features");
					await page.goto(new URL(path, origin).href);
					await page
						.locator(".footer")
						.getByRole("link", { name: "Features", exact: true })
						.click();
					await section(page, "features");
				}
				// Runtime errors are an application-script contract in script-capable
				// contexts. Chromium 158 also reports native CSS transition aborts
				// with all page JavaScript disabled. That case is covered above by
				// its actual URL, focus and header-clearance assertions.
				if (options.javaScriptEnabled !== false)
					assert.deepEqual(
						errors,
						[],
						"Native section navigation must not depend on storage access",
					);
			},
		);
	}

	await scenario(
		"Copied destinations, new tabs and refresh",
		{},
		async (page, context) => {
			await page.goto(`${origin}/changelog/`);
			const href = await page
				.locator(".nav__links")
				.getByRole("link", { name: "Features", exact: true })
				.getAttribute("href");
			assert.equal(href, "/#features");
			const opened = await context.newPage();
			await opened.goto(new URL(href, page.url()).href);
			await section(opened, "features");
			await opened.reload();
			await section(opened, "features", { focused: false });
			await opened.close();
		},
	);

	await scenario("Skip link and keyboard continuation", {}, async (page) => {
		await page.goto(origin);
		await page.keyboard.press("Tab");
		assert.ok(
			await page
				.getByRole("link", { name: "Skip to content", exact: true })
				.evaluate((element) => element === document.activeElement),
		);
		await page.keyboard.press("Enter");
		assert.equal(await page.evaluate(() => document.activeElement.id), "main");
		await page.keyboard.press("Tab");
		assert.ok(
			await page.evaluate(() => !!document.activeElement.closest("main")),
			"Keyboard continuation must enter the main content",
		);
		assert.equal(
			await page.evaluate(
				() => getComputedStyle(document.activeElement).outlineStyle,
			),
			"solid",
			"Unrelated keyboard controls retain their focus indication",
		);
	});

	await scenario(
		"Native changelog permalinks and targeted section links",
		{},
		async (page, context) => {
			await page.goto(`${origin}/changelog/`);
			const permalink = page.locator(".release__name a").first();
			const href = await permalink.getAttribute("href");
			await permalink.click();
			assert.equal(new URL(page.url()).pathname, "/changelog/");
			assert.equal(new URL(page.url()).hash, href);
			const target = page
				.locator(".nav__links")
				.getByRole("link", { name: "Features", exact: true });
			await target.evaluate((element) => (element.target = "_blank"));
			const popupPromise = context.waitForEvent("page", { timeout: 5000 });
			await target.click();
			const popup = await popupPromise;
			await popup.waitForLoadState();
			await section(popup, "features");
			assert.equal(new URL(page.url()).pathname, "/changelog/");
			assert.equal(new URL(page.url()).hash, href);
			await popup.close();
		},
	);

	await scenario(
		"Reduced-motion native fragments",
		{ reducedMotion: "reduce" },
		async (page) => {
			await page.goto(`${origin}/#source`);
			await page
				.locator(".nav__links")
				.getByRole("link", { name: "Features", exact: true })
				.click();
			await section(page, "features");
			assert.equal(
				await page.evaluate(
					() => getComputedStyle(document.documentElement).scrollBehavior,
				),
				"auto",
			);
		},
	);
} finally {
	await browser.close();
}
