import assert from "node:assert/strict";
import deployment from "../landing/config/deployment.json" with { type: "json" };
import { EDITOR_URL } from "../landing/src/links.js";
import { launchBrowser } from "./browser.cjs";

const origin = process.env.YAFFW_EDITOR_ORIGIN || "http://127.0.0.1:3000";
// Vite preview doesn't implement Cloudflare asset routing or _headers rules.
const edge = process.env.YAFFW_SEO_EDGE === "1";
const browser = await launchBrowser();
try {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	assert.equal((await page.goto(origin)).status(), 200);
	assert.equal(await page.title(), "YAFFW video editor");
	assert.equal(
		await page.locator('link[rel="canonical"]').getAttribute("href"),
		EDITOR_URL,
	);
	assert.equal(
		await page.locator('meta[name="robots"]').count(),
		0,
		"The editor root remains indexable",
	);
	assert.match(
		await page.locator('meta[name="description"]').getAttribute("content"),
		/audio tracks.*local video/,
	);
	assert.equal(await page.locator("h1").innerText(), "YAFFW video editor");
	assert.match(
		await page.locator("body").innerText(),
		/requires JavaScript.*WebCodecs/,
	);
	assert.equal(
		await page
			.getByRole("link", { name: /Learn about YAFFW/ })
			.getAttribute("href"),
		deployment.canonicalOrigin,
	);
	for (const [key, expected] of [
		["og:url", EDITOR_URL],
		["og:title", "YAFFW video editor"],
		["twitter:title", "YAFFW video editor"],
		["twitter:card", "summary"],
	]) {
		const meta = page.locator(`meta[property="${key}"], meta[name="${key}"]`);
		assert.equal(await meta.count(), 1);
		assert.equal(await meta.getAttribute("content"), expected);
	}
	const image = new URL(
		await page.locator('meta[property="og:image"]').getAttribute("content"),
	);
	assert.equal(image.origin, new URL(EDITOR_URL).origin);
	assert.equal(
		await page.locator('meta[name="twitter:image"]').getAttribute("content"),
		image.href,
	);
	const icon = await context.request.get(new URL(image.pathname, origin).href);
	assert.equal(icon.status(), 200);
	assert.match(icon.headers()["content-type"], /^image\/png/);
	assert.deepEqual(
		await page.evaluate(async (src) => {
			const image = new Image();
			image.src = src;
			await image.decode();
			return [image.naturalWidth, image.naturalHeight];
		}, new URL(image.pathname, origin).href),
		[512, 512],
	);
	const robots = await context.request.get(`${origin}/robots.txt`);
	assert.equal(robots.status(), 200);
	assert.match(await robots.text(), /^Allow: \/$/m);
	assert.ok(
		(await robots.text()).includes(
			`Sitemap: ${new URL("sitemap.xml", EDITOR_URL).href}`,
		),
	);
	const sitemap = await context.request.get(`${origin}/sitemap.xml`);
	assert.equal(sitemap.status(), 200);
	assert.match(sitemap.headers()["content-type"], /xml/);
	assert.deepEqual(
		await page.evaluate(
			(xml) => {
				const doc = new DOMParser().parseFromString(xml, "application/xml");
				if (doc.querySelector("parsererror"))
					throw new Error("Malformed sitemap XML");
				return [...doc.querySelectorAll("url > loc")].map(
					(loc) => loc.textContent,
				);
			},
			await sitemap.text(),
		),
		[EDITOR_URL],
	);
	const moduleUrl = await page
		.locator('script[type="module"][src]')
		.getAttribute("src");
	await page.goto(`${origin}/404.html`);
	assert.equal(await page.locator("h1").innerText(), "Page not found");
	assert.match(
		await page.locator('meta[name="robots"]').getAttribute("content"),
		/noindex/,
	);
	assert.equal(await page.locator('link[rel="canonical"]').count(), 0);

	if (edge) {
		for (const path of ["/seo-audit-missing", "/changelog/", "/missing.js"]) {
			const response = await context.request.get(`${origin}${path}`);
			assert.equal(
				response.status(),
				404,
				`Missing editor URL must return 404: ${path}`,
			);
		}
		for (const path of ["/editor-next", "/editor-next/", "/index.html"]) {
			const response = await context.request.get(`${origin}${path}`, {
				maxRedirects: 0,
			});
			assert.equal(response.status(), 301);
			assert.equal(response.headers().location, "/");
		}
		const module = await context.request.get(new URL(moduleUrl, origin).href);
		assert.match(
			module.headers()["cache-control"],
			/max-age=31536000.*immutable/,
		);
		const fixture = await context.request.head(
			`${origin}/export-correctness-fixtures/tiny-video-only.mp4`,
		);
		assert.equal(fixture.status(), 200);
		assert.equal(fixture.headers()["x-robots-tag"], "noindex");
	}
	console.log(
		`PASS editor SEO: canonical, sharing image, crawl discovery, no-JS help, noindex error page${edge ? ", edge 404/301/cache rules" : " (edge routing checked separately with YAFFW_SEO_EDGE=1)"}`,
	);
	await context.close();
} finally {
	await browser.close();
}
