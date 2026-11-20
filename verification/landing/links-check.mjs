import assert from "node:assert/strict";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const editor = "https://yaffw.serhii-resnyanskyi.workers.dev/";
const repository = "https://github.com/DarkZeus/yaffw";
const browser = await launchBrowser();

async function destination(locator, expected) {
	assert.ok(await locator.count(), `Missing anchor for ${expected}`);
	for (const element of await locator.all()) {
		assert.equal(await element.getAttribute("href"), expected);
	}
}

try {
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	const staticContext = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1440, height: 1000 },
	});
	await staticContext.route("https://fonts.**/*", (route) => route.abort());
	for (const path of ["/", "/changelog/", "/404.html"]) {
		const page = await staticContext.newPage();
		await page.goto(new URL(path, origin).href);
		await destination(
			page.getByRole("link", { name: /^Open (?:the )?editor/ }),
			editor,
		);
		await destination(
			page.getByRole("link", { name: "Editor", exact: true }),
			editor,
		);
		await destination(
			page.getByRole("link", { name: "YAFFW on GitHub", exact: true }),
			repository,
		);
		await destination(
			page.getByRole("link", { name: "GitHub", exact: true }),
			repository,
		);
		await destination(
			page.getByRole("link", { name: "README", exact: true }),
			`${repository}#readme`,
		);
		await destination(
			page.getByRole("link", { name: "Issues", exact: true }),
			`${repository}/issues`,
		);
		if (path === "/") {
			await destination(
				page.getByRole("link", {
					name: "Start export in the editor",
					exact: true,
				}),
				editor,
			);
			await destination(
				page.getByRole("link", { name: "View source", exact: true }),
				repository,
			);
			await destination(page.locator(".repo__head a"), repository);
			await destination(
				page.getByRole("link", {
					name: "DarkZeus/yaffw on GitHub →",
					exact: true,
				}),
				repository,
			);
			await destination(
				page.getByRole("link", { name: "Read the README", exact: true }),
				`${repository}#readme`,
			);
			assert.match(
				await page.locator("[data-command]").textContent(),
				new RegExp(`git clone ${repository.replaceAll(".", "\\.")}\\.git`),
			);
		}
		await page.close();
		console.log(`PASS native destinations without JavaScript: ${path}`);
	}
	await staticContext.close();

	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
	});
	await context.route("https://fonts.**/*", (route) => route.abort());
	const remoteRequests = [];
	await context.route(`${editor}**`, async (route) => {
		if (route.request().isNavigationRequest())
			remoteRequests.push(route.request().url());
		await route.fulfill({
			contentType: "text/html",
			body: "<!doctype html><title>Editor destination</title>",
		});
	});
	const page = await context.newPage();
	await page.goto(origin);
	await page.locator("[data-demo][data-ready]").waitFor({ timeout: 5000 });
	await page.evaluate(() => {
		document.activeElement.blur();
		window.scrollTo({ top: 0, behavior: "instant" });
	});
	for (const key of [
		"Meta+Enter",
		"Control+Enter",
		"Alt+Enter",
		"Shift+Enter",
	]) {
		await page.keyboard.press(key);
		assert.equal(
			await page.evaluate(() => location.href),
			new URL("/", origin).href,
		);
		assert.equal(
			remoteRequests.length,
			0,
			`${key} must not trigger the hero shortcut`,
		);
	}
	console.log("PASS modified Enter retains the landing page");

	const popupPromise = context.waitForEvent("page", { timeout: 5000 });
	const modifier = await page.evaluate(() =>
		/Mac/.test(navigator.platform) ? "Meta" : "Control",
	);
	await page
		.getByRole("link", { name: "Open editor", exact: true })
		.click({ modifiers: [modifier] });
	const popup = await popupPromise;
	await popup.waitForURL(editor, { timeout: 5000 });
	assert.equal(page.url(), new URL("/", origin).href);
	assert.equal(popup.url(), editor);
	await popup.close();
	console.log(
		"PASS native modified editor click opens the intended destination in a new tab",
	);

	await page.evaluate(() => {
		document.activeElement.blur();
		window.scrollTo({ top: 0, behavior: "instant" });
	});
	await Promise.all([
		page.waitForURL(editor, { timeout: 5000 }),
		page.keyboard.press("Enter"),
	]);
	assert.equal(page.url(), editor);
	assert.ok(remoteRequests.length > 0);
	assert.ok(remoteRequests.every((url) => url === editor));
	await context.close();
	console.log(
		"PASS hero Enter opens the same editor destination as native anchors",
	);
} finally {
	await browser.close();
}
