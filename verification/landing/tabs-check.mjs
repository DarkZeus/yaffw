import assert from "node:assert/strict";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const browser = await launchBrowser();

async function state(page, selected, { focused = true } = {}) {
	const tabs = page.getByRole("tablist", { name: "Commands" });
	const selectedTab = tabs.getByRole("tab", { name: selected, exact: true });
	const otherName = selected === "Run" ? "Develop" : "Run";
	const otherTab = tabs.getByRole("tab", { name: otherName, exact: true });
	const tabStops = await tabs
		.getByRole("tab")
		.evaluateAll((elements) =>
			elements
				.filter((element) => element.tabIndex === 0)
				.map((element) => element.textContent),
		);
	assert.deepEqual(
		tabStops,
		[selected],
		"The tablist must have one managed entry stop",
	);
	assert.equal(await selectedTab.getAttribute("aria-selected"), "true");
	assert.equal(await otherTab.getAttribute("aria-selected"), "false");
	assert.equal(await otherTab.evaluate((element) => element.tabIndex), -1);
	if (focused)
		assert.ok(
			await selectedTab.evaluate(
				(element) => element === document.activeElement,
			),
		);
	const selectedPanel = page.getByRole("tabpanel", {
		name: selected,
		exact: true,
	});
	assert.equal(
		await selectedPanel.count(),
		1,
		"The active tab needs a named panel",
	);
	assert.ok(await selectedPanel.isVisible());
	assert.equal(
		await page.getByRole("tabpanel", { name: otherName, exact: true }).count(),
		0,
	);
	assert.equal(await selectedPanel.evaluate((element) => element.tabIndex), 0);
	assert.equal(
		await page.locator("[data-copy]").isVisible(),
		selected === "Run",
	);
	const snapshot = await page.locator("[data-repo]").ariaSnapshot();
	assert.match(snapshot, new RegExp(`tab "${selected}" \\[selected\\]`));
	assert.match(snapshot, new RegExp(`tabpanel "${selected}"`));
	return selectedPanel;
}

try {
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	await page.route("https://fonts.**/*", (route) => route.abort());
	await page.goto(origin);
	const tabs = page.getByRole("tablist", { name: "Commands" });
	await tabs.waitFor({ state: "visible", timeout: 5000 });
	await state(page, "Run", { focused: false });
	for (const name of ["Run", "Develop"]) {
		const tab = tabs.getByRole("tab", { name, exact: true });
		const tabId = await tab.getAttribute("id");
		const panelId = await tab.getAttribute("aria-controls");
		assert.ok(tabId, `${name} needs a stable id`);
		assert.ok(panelId, `${name} needs aria-controls`);
		const panel = page.locator(`#${panelId}`);
		assert.equal(await panel.count(), 1);
		assert.equal(await panel.getAttribute("role"), "tabpanel");
		assert.equal(await panel.getAttribute("aria-labelledby"), tabId);
	}

	// Tab into the selected tab from the preceding repository link.
	await page.locator(".repo__head a").focus();
	await page.keyboard.press("Tab");
	await state(page, "Run");
	console.log("PASS keyboard entry and accessible tab/panel relationships");

	for (const [key, selected] of [
		["ArrowRight", "Develop"],
		["ArrowRight", "Run"],
		["ArrowLeft", "Develop"],
		["ArrowLeft", "Run"],
		["End", "Develop"],
		["Home", "Run"],
	]) {
		await page.keyboard.press(key);
		await state(page, selected);
	}
	console.log("PASS automatic arrow activation, wrapping, Home and End");

	for (const name of ["Develop", "Run"]) {
		await tabs.getByRole("tab", { name, exact: true }).click();
		const panel = await state(page, name);
		for (const key of ["Enter", "Space"]) {
			await page.keyboard.press(key);
			await state(page, name);
		}
		await page.keyboard.press("Tab");
		assert.ok(
			await panel.evaluate((element) => element === document.activeElement),
			"Tab must reach the active panel",
		);
		await page.keyboard.press("Shift+Tab");
		await state(page, name);
	}
	console.log(
		"PASS pointer/Enter/Space synchronization and panel keyboard reachability",
	);
	await page.close();

	const staticPage = await browser.newPage({ javaScriptEnabled: false });
	await staticPage.goto(origin);
	assert.equal(
		await staticPage.getByRole("tablist", { name: "Commands" }).count(),
		0,
	);
	assert.equal(await staticPage.locator("[data-copy]").isVisible(), false);
	assert.ok(await staticPage.locator("[data-command]").isVisible());
	assert.match(
		await staticPage.locator("[data-command]").textContent(),
		/git clone[\s\S]*pnpm dev/,
	);
	await staticPage.close();
	console.log("PASS useful unenhanced commands with unavailable tab controls");
} finally {
	await browser.close();
}
