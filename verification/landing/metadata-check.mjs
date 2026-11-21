import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { configuredProductionOrigin } from "../../landing/config/site-origin.mjs";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const production = configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN);
const output = resolve("tmp/landing-metadata");
const browser = await launchBrowser();
const pages = [
	["/", "/", "YAFFW: edit local video in your browser"],
	["/changelog/", "/changelog/", "Changelog · YAFFW"],
	["/?preview=1#features", "/", "YAFFW: edit local video in your browser"],
	["/404.html", undefined, "Page not found · YAFFW"],
	["/missing-metadata-page", undefined, "Page not found · YAFFW"],
];

async function meta(page, key) {
	const element = page.locator(
		`head meta[property="${key}"], head meta[name="${key}"]`,
	);
	assert.ok((await element.count()) <= 1, `${key} must have one owner`);
	return (await element.count()) ? element.getAttribute("content") : null;
}

try {
	await mkdir(output, { recursive: true });
	console.log(
		`Browser ${browser.version()}; built landing ${origin}; production identity ${production || "unconfigured preview"}`,
	);
	const context = await browser.newContext({ javaScriptEnabled: false });
	await context.route("https://fonts.**/*", (route) => route.abort());
	const descriptions = new Map();
	let checkedImage = false;
	for (const [path, canonicalPath, title] of pages) {
		const page = await context.newPage();
		await page.goto(new URL(path, origin).href);
		assert.equal(await page.title(), title);
		const description = await meta(page, "description");
		assert.ok(description?.length > 15);
		descriptions.set(title, description);
		assert.match(await meta(page, "theme-color"), /^oklch\(/);
		const canonical = page.locator('head link[rel="canonical"]');
		if (production && canonicalPath) {
			const expected = new URL(canonicalPath, production).href;
			assert.equal(await canonical.count(), 1);
			assert.equal(await canonical.getAttribute("href"), expected);
			assert.equal(await meta(page, "og:url"), expected);
			assert.equal(await meta(page, "og:title"), title);
			assert.ok((await meta(page, "og:description"))?.length > 15);
			assert.equal(await meta(page, "twitter:title"), title);
			assert.equal(await meta(page, "twitter:card"), "summary_large_image");
			assert.equal(await meta(page, "robots"), "max-image-preview:large");
			const image = new URL(await meta(page, "og:image"));
			assert.equal(image.origin, production);
			assert.equal(await meta(page, "twitter:image"), image.href);
			assert.equal(image.pathname, "/og.png");
			assert.equal(await meta(page, "og:image:type"), "image/png");
			assert.equal(await meta(page, "og:image:width"), "1200");
			assert.equal(await meta(page, "og:image:height"), "630");
			assert.match(
				await meta(page, "og:image:alt"),
				/YAFFW.*Edit video in your browser.*No uploads.*No account/,
			);
			assert.equal(
				await meta(page, "twitter:image:alt"),
				await meta(page, "og:image:alt"),
			);
			if (!checkedImage) {
				// Resolve the built asset locally; this verifies pre-deployment output
				// without pretending an unpushed image is already hosted in production.
				const localImage = new URL(image.pathname, origin).href;
				const response = await context.request.get(localImage);
				assert.equal(response.status(), 200);
				assert.match(response.headers()["content-type"], /^image\/png/);
				const bytes = await response.body();
				await writeFile(resolve(output, "social-preview.png"), bytes);
				const dimensions = await page.evaluate(async (url) => {
					const image = new Image();
					image.src = url;
					await image.decode();
					return [image.naturalWidth, image.naturalHeight];
				}, localImage);
				assert.deepEqual(dimensions, [1200, 630]);
				console.log(
					`PASS designed social card: ${dimensions.join("×")}, ${bytes.length} bytes`,
				);
				checkedImage = true;
			}
		} else {
			assert.equal(await canonical.count(), 0);
			assert.equal(
				await page
					.locator('head meta[property^="og:"], head meta[name^="twitter:"]')
					.count(),
				0,
			);
			assert.match(await meta(page, "robots"), /noindex/);
		}
		console.log(
			`PASS metadata ${path}: ${production && canonicalPath ? "production identity" : "no canonical identity"}`,
		);
		await page.close();
	}
	assert.equal(
		new Set(descriptions.values()).size,
		3,
		"Home, changelog and404 descriptions must be distinct",
	);
	await context.close();
} finally {
	await browser.close();
}
