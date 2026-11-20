import assert from "node:assert/strict";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const commands = [
	"git clone https://github.com/DarkZeus/yaffw.git",
	"cd yaffw",
	"pnpm install --frozen-lockfile",
	"pnpm dev",
].join("\n");
const browser = await launchBrowser();

async function scenario(name, { mode, activation, touch = false }) {
	const context = await browser.newContext({
		viewport: touch
			? { width: 390, height: 844 }
			: { width: 1440, height: 1000 },
		hasTouch: touch,
		isMobile: touch,
	});
	try {
		const page = await context.newPage();
		await page.route("https://fonts.**/*", (route) => route.abort());
		await page.addInitScript((clipboardMode) => {
			window.copiedCommands = [];
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value:
					clipboardMode === "unavailable"
						? undefined
						: {
								writeText: async (text) => {
									if (clipboardMode === "rejected")
										throw new DOMException(
											"Clipboard denied",
											"NotAllowedError",
										);
									window.copiedCommands.push(text);
								},
							},
			});
		}, mode);
		await page.goto(origin);
		const button = page.locator("[data-copy]");
		await button.waitFor({ state: "visible", timeout: 5000 });
		const status = page.locator("[data-copy-status]");
		assert.equal(
			await status.count(),
			1,
			"Copy needs accessible status feedback",
		);
		assert.equal(await status.getAttribute("role"), "status");
		assert.equal(await page.locator("[data-command]").textContent(), commands);
		assert.ok(await page.locator("[data-command]").isVisible());
		if (activation === "tap") await button.tap();
		else if (activation === "click") await button.click();
		else {
			await button.focus();
			await page.keyboard.press(activation);
		}
		await page.waitForFunction(
			() => document.querySelector("[data-copy-status]")?.textContent.trim(),
			undefined,
			{ timeout: 5000 },
		);
		const feedback = (await status.textContent()).trim();
		if (mode === "success") {
			assert.deepEqual(await page.evaluate(() => window.copiedCommands), [
				commands,
			]);
			assert.match(feedback, /copied/i);
			assert.doesNotMatch(
				(await page.evaluate(() => window.copiedCommands))[0],
				/\$|➜|localhost/,
				"Clipboard must contain runnable commands without terminal decoration",
			);
		} else {
			assert.deepEqual(await page.evaluate(() => window.copiedCommands), []);
			assert.equal(
				await page.evaluate(() => getSelection()?.toString()),
				commands,
			);
			assert.ok(
				await page
					.locator("pre[data-pane='0']")
					.evaluate((element) => element === document.activeElement),
				"The selected command block must receive focus for manual recovery",
			);
			assert.match(feedback, /copy/i);
			assert.match(feedback, /select|manual|browser/i);
			assert.doesNotMatch(feedback, /⌘|press (?:command|cmd)|successfully/i);
			assert.doesNotMatch(await button.textContent(), /copied|⌘/i);
			assert.equal(
				await page
					.locator("[data-command]")
					.evaluate((element) => getComputedStyle(element).userSelect),
				"text",
				"Command text must remain selectable",
			);
		}
		console.log(`PASS ${name}`);
	} finally {
		await context.close();
	}
}

try {
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	await scenario("Copy success by pointer", {
		mode: "success",
		activation: "click",
	});
	await scenario("Copy success by Space", {
		mode: "success",
		activation: "Space",
	});
	await scenario("Clipboard denial by Enter", {
		mode: "rejected",
		activation: "Enter",
	});
	await scenario("Clipboard API unavailable", {
		mode: "unavailable",
		activation: "click",
	});
	await scenario("Clipboard denial on touch", {
		mode: "rejected",
		activation: "tap",
		touch: true,
	});
} finally {
	await browser.close();
}
