import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const output = resolve("tmp/landing-mobile-navigation");
const browser = await launchBrowser();
const sections = ["/#demo", "/#local", "/#features", "/#shortcuts", "/#source"];

async function expanded(page, expected) {
	const menu = page.locator("[data-section-menu]");
	assert.equal(await menu.evaluate((element) => element.open), expected);
	const accessibility = await page.context().newCDPSession(page);
	try {
		const { nodes } = await accessibility.send("Accessibility.getFullAXTree");
		const control = nodes.find(
			(node) =>
				node.name?.value === "Menu" &&
				node.properties?.some((property) => property.name === "expanded"),
		);
		assert.ok(control, "Menu must expose native accessible expanded state");
		assert.equal(
			control.properties.find((property) => property.name === "expanded").value
				.value,
			expected,
		);
	} finally {
		await accessibility.detach();
	}
}

async function layout(page, compact) {
	const boxes = [];
	for (const element of await page.locator(".nav a, .nav summary").all()) {
		if (!(await element.isVisible())) continue;
		const box = await element.boundingBox();
		const name =
			(await element.getAttribute("aria-label")) ||
			(await element.textContent()).trim();
		assert.ok(
			box.x >= -0.5 && box.x + box.width <= page.viewportSize().width + 0.5,
			`${name} must fit inside the viewport`,
		);
		if (compact) {
			assert.ok(
				box.height >= 43.5,
				`${name} needs at least a 44px touch height (${box.height})`,
			);
			assert.ok(
				box.width >= 43.5,
				`${name} needs at least a 44px touch width (${box.width})`,
			);
		}
		boxes.push({ name, ...box });
	}
	for (let first = 0; first < boxes.length; first++) {
		for (let second = first + 1; second < boxes.length; second++) {
			const a = boxes[first];
			const b = boxes[second];
			const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
			const height =
				Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
			assert.ok(width <= 0.5 || height <= 0.5, `${a.name} overlaps ${b.name}`);
		}
	}
	assert.ok(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth + 1,
		),
		"Navigation must not introduce horizontal document overflow",
	);
}

async function common(page, path, compact) {
	const header = page.locator(".nav");
	const changelog = compact
		? header.locator('.nav__menu-links a[href="/changelog/"]')
		: header.getByRole("link", { name: "Changelog", exact: true });
	assert.equal(await changelog.count(), 1);
	assert.equal(
		await changelog.isVisible(),
		!compact,
		"Changelog belongs inside the closed mobile menu and stays visible on desktop",
	);
	assert.equal(await changelog.getAttribute("href"), "/changelog/");
	assert.equal(
		await changelog.getAttribute("aria-current"),
		path === "/changelog/" ? "page" : null,
	);
	const brand = header.getByRole("link", { name: "YAFFW home", exact: true });
	assert.ok(await brand.isVisible());
	assert.equal(await brand.getAttribute("href"), "/");
	assert.ok(
		await brand.locator("span").isVisible(),
		"Keep the YAFFW wordmark visible",
	);
	const editor = header.getByRole("link", { name: "Open editor", exact: true });
	assert.ok(await editor.isVisible());
	assert.equal(
		await editor.getAttribute("href"),
		"https://yaffw.serhii-resnyanskyi.workers.dev/",
	);
	if (compact) {
		assert.equal(await header.locator("details[data-section-menu]").count(), 1);
		assert.ok(
			await header.locator("[data-section-menu] > summary").isVisible(),
		);
		assert.equal(
			await header
				.locator("[data-section-menu] > summary")
				.getAttribute("aria-label"),
			"Menu",
		);
		await expanded(page, false);
	} else
		assert.equal(
			await header.locator("[data-section-menu]").isVisible(),
			false,
		);
	await layout(page, compact);
	return changelog.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).fontSize),
	);
}

async function target(page, { focused = true } = {}) {
	await page.waitForURL("**/#features");
	let result;
	for (let attempt = 0; attempt < 100; attempt++) {
		result = await page.evaluate(() => ({
			focus: document.activeElement.id,
			top: document.getElementById("features")?.getBoundingClientRect().top,
			header: document.querySelector(".nav__inner").getBoundingClientRect()
				.bottom,
			height: innerHeight,
		}));
		if (
			(!focused || result.focus === "features") &&
			result.top >= result.header - 1 &&
			result.top < result.height
		)
			return;
		await delay(30);
	}
	assert.fail(`Section focus/clearance failed: ${JSON.stringify(result)}`);
}

async function sectionLink(page, compact, javaScriptEnabled) {
	if (compact) {
		const menu = page.locator("[data-section-menu]");
		if (!(await menu.evaluate((element) => element.open)))
			await menu.locator("summary").click();
		await expanded(page, true);
		assert.deepEqual(
			await page
				.locator(".nav__menu-links a")
				.evaluateAll((elements) =>
					elements.map((element) => element.getAttribute("href")),
				),
			[...sections, "/changelog/"],
		);
		await layout(page, true);
		await page.locator('.nav__menu-links a[href="/#features"]').click();
		await page.waitForURL("**/#features");
		assert.equal(
			await page.evaluate(() => document.activeElement.id),
			"features",
			"Plain activation must retain native target focus",
		);
		const currentMenu = page.locator("[data-section-menu]");
		if (javaScriptEnabled) {
			for (
				let attempt = 0;
				attempt < 50 && (await currentMenu.evaluate((element) => element.open));
				attempt++
			)
				await delay(20);
			await expanded(page, false);
			await target(page);
			await page.keyboard.press("Tab");
			assert.ok(
				await page.evaluate(() => {
					const destination = document.getElementById("features");
					return (
						destination.contains(document.activeElement) ||
						!!(
							destination.compareDocumentPosition(document.activeElement) &
							Node.DOCUMENT_POSITION_FOLLOWING
						)
					);
				}),
				"Keyboard continuation must follow the section instead of returning to the header",
			);
		} else {
			// Keep native details open: its unenhanced in-flow header must scroll
			// away instead of covering the section or forcing a return to the header.
			await target(page);
		}
	} else {
		await page.locator('.nav__sections a[href="/#features"]').click();
		await target(page);
	}
}

async function enhancedDismissal(page, context) {
	const menu = page.locator("[data-section-menu]");
	const summary = menu.locator("summary");
	await page.locator(".nav .brand").focus();
	await page.keyboard.press("Tab");
	assert.ok(
		await page
			.locator(".nav__actions .btn")
			.evaluate((element) => element === document.activeElement),
		"The editor action must follow the brand in keyboard order",
	);
	await page.keyboard.press("Tab");
	assert.ok(
		await summary.evaluate((element) => element === document.activeElement),
		"The far-right menu must follow the editor action in keyboard order",
	);
	await page.keyboard.press("Enter");
	await expanded(page, true);
	await page.keyboard.press("Tab");
	assert.ok(
		await page.evaluate(
			() => !!document.activeElement.closest(".nav__menu-links"),
		),
	);
	await page.keyboard.press("Escape");
	await expanded(page, false);
	assert.ok(
		await summary.evaluate((element) => element === document.activeElement),
	);

	await summary.click();
	await page.locator(".nav .brand").focus();
	await expanded(page, false);
	assert.ok(
		await page
			.locator(".nav .brand")
			.evaluate((element) => element === document.activeElement),
		"Outside focus dismissal must not steal focus",
	);

	await summary.click();
	const outside = page.locator("[data-selection-example] > summary");
	await outside.click();
	await expanded(page, false);
	assert.ok(
		await outside.evaluate((element) => element === document.activeElement),
		"Outside pointer dismissal must preserve the clicked control's focus",
	);

	await summary.click();
	const initial = page.url();
	const popupPromise = context.waitForEvent("page", { timeout: 5000 });
	const modifier = await page.evaluate(() =>
		/Mac/.test(navigator.platform) ? "Meta" : "Control",
	);
	await page
		.locator('.nav__menu-links a[href="/#source"]')
		.click({ modifiers: [modifier] });
	const popup = await popupPromise;
	await popup.waitForURL("**/#source");
	assert.equal(page.url(), initial);
	await expanded(page, true);
	await popup.close();
	await summary.click();
	await expanded(page, false);
}

try {
	await mkdir(output, { recursive: true });
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	for (const width of [320, 390, 768, 1440]) {
		const compact = width <= 960;
		for (const javaScriptEnabled of [true, false]) {
			const context = await browser.newContext({
				viewport: { width, height: 844 },
				javaScriptEnabled,
				reducedMotion: "reduce",
			});
			context.setDefaultTimeout(5000);
			await context.route("https://fonts.**/*", (route) => route.abort());
			for (const path of ["/", "/changelog/", "/404.html"]) {
				const page = await context.newPage();
				await page.goto(new URL(path, origin).href);
				const normalSize = await common(page, path, compact);
				if (compact) {
					const headerBox = await page.locator(".nav__inner").boundingBox();
					assert.ok(
						headerBox.height <= 60,
						"Default compact header must remain a single row (at most 60px)",
					);
					const brandBox = await page.locator(".nav .brand").boundingBox();
					const editorBox = await page
						.locator(".nav__actions .btn")
						.boundingBox();
					const menuBox = await page
						.locator("[data-section-menu] > summary")
						.boundingBox();
					assert.ok(
						brandBox.x + brandBox.width < editorBox.x,
						"Brand and right-side actions must form separate groups",
					);
					const actionGap = menuBox.x - editorBox.x - editorBox.width;
					assert.ok(
						actionGap >= 4 && actionGap <= 12,
						"Editor and far-right menu must remain adjacent",
					);
					assert.ok(
						Math.abs(editorBox.y - menuBox.y) < 1,
						"Editor and menu must share one row",
					);
				}
				if (javaScriptEnabled) {
					const name =
						path === "/"
							? "home"
							: path === "/changelog/"
								? "changelog"
								: "404";
					await page.locator(".nav").screenshot({
						path: resolve(output, `${width}-${name}-header.png`),
						animations: "disabled",
					});
				}
				if (compact && javaScriptEnabled && path === "/") {
					await enhancedDismissal(page, context);
					await page.locator("[data-section-menu] > summary").click();
					await page.screenshot({
						path: resolve(output, `${width}-sections-open.png`),
						animations: "disabled",
					});
				}
				await sectionLink(page, compact, javaScriptEnabled);
				console.log(
					`PASS ${width}px ${path} ${javaScriptEnabled ? "JS" : "noJS"}: visible destinations, layout, native sections`,
				);

				if (!javaScriptEnabled) {
					await page.goto(new URL(path, origin).href);
					await page.evaluate(
						() => (document.documentElement.style.fontSize = "200%"),
					);
					const enlarged = await common(page, path, compact);
					assert.ok(
						enlarged >= normalSize * 1.99,
						"The header must respond to 200% text enlargement",
					);
					if (width === 320 && path === "/")
						await page.screenshot({
							path: resolve(output, "320-enlarged-header.png"),
							animations: "disabled",
						});
					await sectionLink(page, compact, false);
					console.log(
						`PASS ${width}px ${path} noJS 200%: enlarged text, nonoverlap, native sections`,
					);
				}
				if (compact) {
					const menu = page.locator("[data-section-menu]");
					if (!(await menu.evaluate((element) => element.open)))
						await menu.locator("summary").click();
					await page.locator('.nav__menu-links a[href="/changelog/"]').click();
					await page.waitForURL("**/changelog/");
					assert.equal(
						await page
							.locator('.nav__menu-links a[href="/changelog/"]')
							.getAttribute("aria-current"),
						"page",
					);
				}
				await page.close();
			}
			await context.close();
		}
	}
} finally {
	await browser.close();
}
