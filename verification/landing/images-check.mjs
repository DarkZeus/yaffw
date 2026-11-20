import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const output = resolve("tmp/landing-images");
const originalBytes = (await stat("landing/src/assets/workbench.jpg")).size;
const widths = [480, 800, 1200, 1800, 2400, 2940];
const browser = await launchBrowser();
const results = [];

async function imageInfo(image) {
	return image.evaluate((element) => ({
		url: element.currentSrc,
		width: element.getBoundingClientRect().width,
		height: element.getBoundingClientRect().height,
		intrinsicWidth: element.getAttribute("width"),
		intrinsicHeight: element.getAttribute("height"),
		loading: element.loading,
		priority: element.fetchPriority,
		alt: element.alt,
	}));
}

try {
	await mkdir(output, { recursive: true });
	console.log(`Browser ${browser.version()}; built landing ${origin}`);
	for (const [width, density] of [
		[390, 1],
		[390, 2],
		[768, 1],
		[1440, 1],
	]) {
		const context = await browser.newContext({
			viewport: { width, height: 1000 },
			deviceScaleFactor: density,
			reducedMotion: "reduce",
		});
		try {
			await context.route("https://fonts.**/*", (route) => route.abort());
			const page = await context.newPage();
			const requests = [];
			const responses = new Map();
			page.on("request", (request) => {
				if (
					request.resourceType() === "image" &&
					request.url().includes("workbench")
				)
					requests.push(request.url());
			});
			page.on("response", (response) => {
				if (
					response.request().resourceType() === "image" &&
					response.url().includes("workbench")
				)
					responses.set(response.url(), response);
			});
			await page.goto(origin);
			const hero = page.locator(".hero__shot img");
			await hero.evaluate((element) => element.decode());
			const before = await imageInfo(hero);
			assert.equal(before.loading, "eager");
			assert.equal(before.priority, "high");
			assert.match(
				before.alt,
				/video preview.*output settings.*selection timeline/i,
			);
			assert.equal(before.intrinsicWidth, "2940");
			assert.equal(before.intrinsicHeight, "1838");
			assert.ok(Math.abs(before.width / before.height - 2940 / 1838) < 0.01);
			const picture = hero.locator("..");
			for (const type of ["image/avif", "image/webp"]) {
				const source = picture.locator(`source[type="${type}"]`);
				assert.deepEqual(
					(await source.getAttribute("srcset"))
						.split(",")
						.map((candidate) =>
							Number(candidate.trim().split(/\s+/)[1].slice(0, -1)),
						),
					widths,
				);
				assert.ok(await source.getAttribute("sizes"));
			}
			assert.match(await hero.getAttribute("src"), /\.jpg$/);
			assert.equal(
				(await hero.getAttribute("srcset")).split(",").length,
				widths.length,
			);
			const selected = (
				await picture
					.locator('source[type="image/avif"]')
					.getAttribute("srcset")
			)
				.split(",")
				.map((candidate) => candidate.trim().split(/\s+/))
				.find(([url]) => new URL(url, origin).href === before.url);
			assert.ok(selected, "Chromium must select a generated AVIF candidate");
			const selectedWidth = Number(selected[1].slice(0, -1));
			assert.ok(selectedWidth >= before.width * density - 1);
			assert.ok(selectedWidth <= before.width * density * 1.5);
			const response = responses.get(before.url);
			assert.ok(response);
			assert.equal(response.status(), 200);
			const bytes = (await response.body()).length;
			assert.ok(
				bytes < originalBytes / 2,
				"Selected image must materially reduce the original payload",
			);
			assert.equal(
				requests.length,
				1,
				"Only the eager hero candidate should transfer initially",
			);
			const backdrop = page.locator(".cta__bg");
			assert.equal(await backdrop.getAttribute("loading"), "lazy");
			assert.equal(await backdrop.getAttribute("alt"), "");
			await page
				.locator(".hero__shot")
				.screenshot({ path: resolve(output, `${width}-${density}x-hero.png`) });
			await page.locator(".cta").scrollIntoViewIfNeeded();
			await page.waitForFunction(() => {
				const image = document.querySelector(".cta__bg");
				return image.complete && image.naturalWidth > 0;
			});
			const after = await imageInfo(backdrop);
			if (width <= 768)
				assert.equal(
					after.url,
					before.url,
					"Matching phone/tablet candidates must reuse the same URL",
				);
			assert.equal(requests.filter((url) => url === before.url).length, 1);
			assert.equal(requests.filter((url) => url === after.url).length, 1);
			const cta = await page.locator(".cta").boundingBox();
			assert.ok(Math.abs(after.width - cta.width) < 2);
			assert.ok(Math.abs(after.height - cta.height) < 2);
			await page
				.locator(".cta")
				.screenshot({ path: resolve(output, `${width}-${density}x-cta.png`) });
			const metadata = await page
				.locator('meta[property="og:image"]')
				.getAttribute("content");
			assert.equal(
				(await context.request.head(new URL(metadata, origin).href)).status(),
				200,
			);
			results.push({
				width,
				density,
				selectedWidth,
				bytes,
				originalBytes,
				hero: before,
				backdrop: after,
				requests,
			});
			console.log(
				`PASS ${width}px ${density}x: ${selectedWidth}w, ${bytes} bytes; lazy backdrop and reuse`,
			);
		} finally {
			await context.close();
		}
	}
	const delayed = await browser.newContext({
		viewport: { width: 390, height: 1000 },
		reducedMotion: "reduce",
	});
	const gate = Promise.withResolvers();
	try {
		await delayed.route("https://fonts.**/*", (route) => route.abort());
		await delayed.route("**/workbench.*", async (route) => {
			await gate.promise;
			await route.continue();
		});
		const page = await delayed.newPage();
		await page.goto(origin, { waitUntil: "domcontentloaded" });
		const hero = page.locator(".hero__shot img");
		const reserved = await hero.boundingBox();
		assert.ok(
			reserved.height > 200,
			"The unloaded hero must reserve its space",
		);
		gate.resolve();
		await hero.evaluate((element) => element.decode());
		const loaded = await hero.boundingBox();
		assert.ok(Math.abs(loaded.height - reserved.height) < 1);
		assert.ok(Math.abs(loaded.width - reserved.width) < 1);
		console.log(
			"PASS delayed hero: intrinsic dimensions reserve the final layout",
		);
	} finally {
		gate.resolve();
		await delayed.close();
	}
	await writeFile(
		resolve(output, "report.json"),
		JSON.stringify(results, null, 2),
	);
} finally {
	await browser.close();
}
