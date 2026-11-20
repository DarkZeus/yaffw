import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createCanvas, loadImage } from "canvas";
import { wcagContrast } from "culori";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const output = resolve("tmp/landing-contrast");
const browser = await launchBrowser();
const results = [];

function pixels(image) {
	const canvas = createCanvas(image.width, image.height);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	return context.getImageData(0, 0, image.width, image.height);
}

function color(data, x, y) {
	const offset = (Math.floor(y) * data.width + Math.floor(x)) * 4;
	return {
		mode: "rgb",
		r: data.data[offset] / 255,
		g: data.data[offset + 1] / 255,
		b: data.data[offset + 2] / 255,
	};
}

async function measure(page, label, { header = false } = {}) {
	// Compare rendered background pixels with solid foreground patches through
	// the same ancestor opacity. Ignore antialiasing/text shadows; retain actual
	// gradients, translucent surfaces, and clipping instead of guessing a palette.
	const samples = await page.evaluate((onlyHeader) => {
		const root = onlyHeader ? document.querySelector(".nav") : document.body;
		const nodes = [];
		const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		while (walk.nextNode()) {
			const node = walk.currentNode;
			const parent = node.parentElement;
			if (
				!node.textContent.trim() ||
				parent.closest('script, style, svg, [aria-hidden="true"], [hidden]') ||
				(!onlyHeader && parent.closest(".nav")) ||
				!parent.getClientRects().length ||
				getComputedStyle(parent).visibility !== "visible"
			)
				continue;
			nodes.push(node);
		}
		return nodes.map((node, index) => {
			const parent = node.parentElement;
			const style = getComputedStyle(parent);
			const sample = document.createElement("contrast-sample");
			sample.dataset.contrastSample = String(index);
			sample.style.color = "transparent";
			sample.style.backgroundColor = "transparent";
			sample.style.textShadow = "none";
			sample.dataset.foreground = style.color;
			node.replaceWith(sample);
			sample.append(node);
			const size = Number.parseFloat(style.fontSize);
			const weight = Number.parseFloat(style.fontWeight);
			return {
				text: node.textContent.trim(),
				owner: `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ""}${[...parent.classList].map((name) => `.${name}`).join("")}`,
				foreground: style.color,
				size,
				weight,
				threshold: size >= 24 || (size >= 18.667 && weight >= 700) ? 3 : 4.5,
				rects: [...sample.getClientRects()].map((rect) => {
					let left = rect.left;
					let right = rect.right;
					let top = rect.top;
					let bottom = rect.bottom;
					for (
						let ancestor = parent;
						ancestor;
						ancestor = ancestor.parentElement
					) {
						const ancestorStyle = getComputedStyle(ancestor);
						const bounds = ancestor.getBoundingClientRect();
						if (ancestorStyle.overflowX !== "visible") {
							left = Math.max(left, bounds.left);
							right = Math.min(right, bounds.right);
						}
						if (ancestorStyle.overflowY !== "visible") {
							top = Math.max(top, bounds.top);
							bottom = Math.min(bottom, bounds.bottom);
						}
					}
					return {
						x: left,
						y: top + (onlyHeader ? 0 : window.scrollY),
						width: Math.max(0, right - left),
						height: Math.max(0, bottom - top),
					};
				}),
			};
		});
	}, header);
	const background = pixels(
		await loadImage(await page.screenshot({ fullPage: !header })),
	);
	await page.locator("contrast-sample").evaluateAll((elements) => {
		for (const element of elements)
			element.style.backgroundColor = element.dataset.foreground;
	});
	const foreground = pixels(
		await loadImage(await page.screenshot({ fullPage: !header })),
	);
	for (const sample of samples) {
		let minimum = Infinity;
		for (const rect of sample.rects) {
			if (rect.width < 2 || rect.height < 2) continue;
			const y = Math.floor(rect.y + rect.height / 2);
			if (y < 0 || y >= background.height) continue;
			for (let x = Math.ceil(rect.x + 1); x < rect.x + rect.width - 1; x += 4) {
				if (x < 0 || x >= background.width) continue;
				minimum = Math.min(
					minimum,
					wcagContrast(color(foreground, x, y), color(background, x, y)),
				);
			}
		}
		if (Number.isFinite(minimum))
			results.push({ label, ...sample, rects: undefined, ratio: minimum });
	}
	await page.locator("contrast-sample").evaluateAll((elements) => {
		for (const element of elements) element.replaceWith(...element.childNodes);
	});
}

try {
	await mkdir(output, { recursive: true });
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	for (const viewport of [
		{ width: 1440, height: 1000 },
		{ width: 390, height: 844 },
	]) {
		const context = await browser.newContext({
			viewport,
			reducedMotion: "reduce",
		});
		await context.route("https://fonts.**/*", (route) => route.abort());
		for (const path of ["/", "/changelog/", "/404.html"]) {
			const page = await context.newPage();
			await page.goto(new URL(path, origin).href);
			if (path === "/") {
				await page
					.locator("[data-demo][data-ready]")
					.waitFor({ timeout: 5000 });
				await page.locator(".bound").scrollIntoViewIfNeeded();
				await delay(1500); // The diagram's persistent post-delivery state follows its delayed transition.
				await page.locator("[data-keyboard-disclosure] > summary").click();
				await page.locator("[data-try]").scrollIntoViewIfNeeded();
				for (const [name, selector] of [
					["hero", ".hero"],
					["local", ".bound"],
					["shortcuts", ".try"],
					["workflow", "#demo"],
					["demo", "[data-demo]"],
				]) {
					await page.locator(selector).screenshot({
						path: resolve(output, `${viewport.width}-${name}.png`),
						animations: "disabled",
					});
				}
			}
			if (path === "/changelog/")
				await page
					.locator(".release")
					.first()
					.screenshot({
						path: resolve(output, `${viewport.width}-changelog.png`),
						animations: "disabled",
					});
			await page.evaluate(() =>
				window.scrollTo({ top: 0, behavior: "instant" }),
			);
			await measure(page, `${viewport.width}px ${path}`);
			await page.close();
		}
		const headerPage = await context.newPage();
		await headerPage.goto(origin);
		await headerPage.locator(".hero__shot").scrollIntoViewIfNeeded();
		await delay(200);
		await measure(headerPage, `${viewport.width}px header over hero`, {
			header: true,
		});
		await headerPage.evaluate(() => {
			window.scrollTo({ top: 500, behavior: "instant" });
			const backdrop = document.createElement("div");
			backdrop.style.cssText =
				"position:fixed;inset:0;z-index:49;background:oklch(1 0 none);pointer-events:none";
			document.body.append(backdrop);
		});
		await delay(200);
		await measure(
			headerPage,
			`${viewport.width}px header worst-white backdrop`,
			{ header: true },
		);
		await context.close();
	}
	const failures = results.filter((result) => result.ratio < result.threshold);
	await writeFile(
		resolve(output, "report.json"),
		JSON.stringify({ results, failures }, null, 2),
	);
	for (const result of failures)
		console.log(
			`FAIL ${result.label}: ${result.owner} “${result.text.slice(0, 70)}” ${result.ratio.toFixed(2)}:1 < ${result.threshold}:1`,
		);
	console.log(
		`${results.length} rendered text samples; ${failures.length} failures. Report: ${resolve(output, "report.json")}`,
	);
	assert.deepEqual(
		failures,
		[],
		"Meaningful rendered text must meet its WCAG AA contrast threshold",
	);
} finally {
	await browser.close();
}
