import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { wcagContrast } from "culori";
import { launchBrowser } from "./browser.cjs";

const origin = process.env.YAFFW_EDITOR_ORIGIN || "http://127.0.0.1:3000";
const output = resolve("tmp/workbench-appearance");
const media =
	process.env.YAFFW_APPEARANCE_MEDIA ||
	resolve("public/export-correctness-fixtures/tiny-video-with-audio.mp4");
const captureLanding = process.argv.includes("--landing-captures");
const browser = await launchBrowser();

async function appearance(page, theme) {
	await page
		.getByRole("combobox", { name: "Appearance", exact: true })
		.selectOption(theme);
	await page.waitForFunction(
		(expected) => document.documentElement.classList.contains(expected),
		theme === "system" ? "light" : theme,
	);
}
async function palette(page, selector = ".cinema-workbench") {
	return page.locator(selector).evaluate((el) => {
		const s = getComputedStyle(el);
		return {
			scheme: s.colorScheme,
			ink: s.color,
			surface: s.backgroundColor,
			waveform: s.getPropertyValue("--workbench-waveform").trim(),
		};
	});
}
async function waveformImage(page) {
	return page
		.locator(".selection-waveform-surface")
		.first()
		.evaluate((el) => {
			const host = [...el.querySelectorAll("*")].find(
				(child) => child.shadowRoot,
			);
			return host?.shadowRoot.querySelector("canvas")?.toDataURL();
		});
}
try {
	await mkdir(output, { recursive: true });
	const context = await browser.newContext({
		viewport: { width: 1600, height: 900 },
		colorScheme: "light",
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(origin);
	await page
		.getByRole("combobox", { name: "Appearance", exact: true })
		.waitFor();
	assert.equal(
		await page
			.getByRole("combobox", { name: "Appearance", exact: true })
			.inputValue(),
		"dark",
	);
	assert.equal((await palette(page)).scheme, "dark");
	await page.screenshot({ path: resolve(output, "dark-empty.png") });
	await appearance(page, "light");
	assert.equal((await palette(page)).scheme, "light");
	assert.equal(
		await page.evaluate(() => localStorage.getItem("theme")),
		"light",
	);
	await page.screenshot({ path: resolve(output, "light-empty.png") });
	const restored = await context.newPage();
	await restored.goto(origin);
	await restored.waitForFunction(() =>
		document.documentElement.classList.contains("light"),
	);
	assert.equal(
		await restored
			.getByRole("combobox", { name: "Appearance", exact: true })
			.inputValue(),
		"light",
	);
	await restored.close();
	console.log(
		"PASS dark default, light preference, and restoration in a new page",
	);

	await page.locator('input[type="file"]').setInputFiles(media);
	await page
		.getByRole("tab", { name: "Export", exact: true })
		.waitFor({ timeout: 20000 });
	await page.getByRole("tab", { name: "Export", exact: true }).click();
	await page
		.getByRole("button", { name: "Start export", exact: true })
		.waitFor({ timeout: 20000 });
	await page
		.locator('.selection-waveform-surface[data-renderer="wavesurfer"]')
		.first()
		.waitFor({ timeout: 20000 });
	await page.waitForFunction(() =>
		[...document.querySelectorAll("video")].some(
			(video) => video.readyState >= 2,
		),
	);
	const video = await page.locator("video").elementHandle();
	const lightPalette = await palette(page);
	const caption = page
		.getByTestId("video-strip-thumbnail")
		.first()
		.locator("span");
	await caption.waitFor();
	const colors = await caption.evaluate((el) => ({
		ink: getComputedStyle(el).color,
		fill: getComputedStyle(el).backgroundColor,
	}));
	assert.ok(
		wcagContrast(colors.ink, colors.fill) >= 4.5,
		"Thumbnail timestamps must retain readable contrast in the light selection",
	);
	const lightWaveform = await waveformImage(page);
	assert.ok(lightWaveform, "WaveSurfer must paint a real canvas");
	await appearance(page, "dark");
	const darkPalette = await palette(page);
	assert.notEqual(lightPalette.waveform, darkPalette.waveform);
	await page.waitForFunction((previous) => {
		const root = document.querySelector(".selection-waveform-surface");
		const host = [...root.querySelectorAll("*")].find(
			(child) => child.shadowRoot,
		);
		return host?.shadowRoot.querySelector("canvas")?.toDataURL() !== previous;
	}, lightWaveform);
	assert.ok(
		await video.evaluate((el) => el === document.querySelector("video")),
		"Theme changes must preserve the mounted media player",
	);
	await page.screenshot({ path: resolve(output, "dark-ready.png") });
	await appearance(page, "light");
	await page.waitForFunction(
		() =>
			document.querySelector(".selection-waveform-surface").dataset.renderer ===
			"wavesurfer",
	);
	await page.screenshot({ path: resolve(output, "light-ready.png") });
	console.log(
		"PASS theme switching preserves the player and repaints the waveform canvas",
	);

	await page
		.getByRole("button", { name: "Output settings", exact: true })
		.click();
	await page.getByRole("dialog").waitFor();
	assert.equal(
		(await palette(page, ".quality-settings-dialog")).scheme,
		"light",
	);
	await page
		.getByRole("dialog")
		.screenshot({ path: resolve(output, "light-output-settings.png") });
	await page.keyboard.press("Escape");
	await page
		.getByLabel("Preview viewer header", { exact: true })
		.click({ button: "right" });
	await page
		.getByRole("menu", { name: "Preview layout", exact: true })
		.waitFor();
	assert.equal(
		(await palette(page, '[data-slot="context-menu-content"]')).scheme,
		"light",
	);
	await page.keyboard.press("Escape");
	console.log(
		"PASS output settings and portaled layout menu follow the light theme",
	);

	await appearance(page, "system");
	assert.equal((await palette(page)).scheme, "light");
	await page.emulateMedia({ colorScheme: "dark" });
	await page.waitForFunction(() =>
		document.documentElement.classList.contains("dark"),
	);
	assert.equal((await palette(page)).scheme, "dark");
	await page.emulateMedia({ colorScheme: "light" });
	await page.waitForFunction(() =>
		document.documentElement.classList.contains("light"),
	);
	assert.equal((await palette(page)).scheme, "light");
	console.log(
		"PASS System follows changing OS appearance without reloading media",
	);

	await appearance(page, "light");
	if (captureLanding) {
		await page.waitForFunction(
			() => {
				const header = document.querySelector(
					'[data-testid="video-thumbnail-lane-header"]',
				);
				const images = [
					...document.querySelectorAll(
						'[data-testid="video-thumbnail-grid"] img',
					),
				];
				return (
					header &&
					/\d+\s*frames$/.test(header.textContent.trim()) &&
					!header.textContent.includes("/") &&
					images.length > 0 &&
					images.every((image) => image.complete && image.naturalWidth > 0)
				);
			},
			undefined,
			{ timeout: 35000 },
		);
		await page.getByRole("tab", { name: "Export", exact: true }).click();
		await page.getByRole("heading", { name: "Output", exact: true }).click();
		await page.screenshot({
			path: resolve("landing/src/assets/workbench-current.jpg"),
			type: "jpeg",
			quality: 92,
		});
		const exportBox = await page
			.getByLabel("Export inspector", { exact: true })
			.boundingBox();
		await page.screenshot({
			path: resolve("landing/src/assets/export-panel.jpg"),
			type: "jpeg",
			quality: 92,
			clip: { ...exportBox, height: Math.min(490, exportBox.height) },
		});
		await page.getByRole("tab", { name: "Audio", exact: true }).click();
		await page
			.getByLabel("Audio channel strip bank", { exact: true })
			.screenshot({
				path: resolve("landing/src/assets/audio-panel.jpg"),
				type: "jpeg",
				quality: 92,
			});
		console.log(
			"PASS captured the real light workbench, Export and Audio for the landing",
		);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("tab", { name: "Export", exact: true }).click();
	const control = page.getByRole("combobox", {
		name: "Appearance",
		exact: true,
	});
	await control.focus();
	assert.ok(await control.evaluate((el) => el.matches(":focus-visible")));
	assert.ok(
		await control.evaluate(
			(el) => parseFloat(getComputedStyle(el).outlineWidth) >= 2,
		),
	);
	assert.ok(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	);
	await page.screenshot({
		path: resolve(output, "light-mobile.png"),
		fullPage: true,
	});
	console.log("PASS narrow layout and visible keyboard focus");
	assert.deepEqual(errors, []);
	await context.close();
} finally {
	await browser.close();
}
