import assert from "node:assert/strict";
import { configuredProductionOrigin } from "../../landing/config/site-origin.mjs";
import { EDITOR_URL, REPO_URL } from "../../landing/src/links.js";
import { launchBrowser } from "../browser.cjs";

const origin = process.env.YAFFW_LANDING_ORIGIN || "http://127.0.0.1:4174";
const production = configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN);
const edge = process.env.YAFFW_SEO_EDGE === "1";
const browser = await launchBrowser();

try {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	const robotsResponse = await context.request.get(`${origin}/robots.txt`);
	assert.equal(robotsResponse.status(), 200);
	assert.match(robotsResponse.headers()["content-type"], /^text\/plain/);
	const robots = await robotsResponse.text();
	assert.match(robots, /^User-agent: \*$/m);
	assert.match(robots, /^Allow: \/$/m);
	assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m);
	const sitemapResponse = await context.request.get(`${origin}/sitemap.xml`);
	assert.equal(sitemapResponse.status(), 200);
	assert.match(sitemapResponse.headers()["content-type"], /xml/);
	const sitemap = await sitemapResponse.text();
	const locations = await page.evaluate((xml) => {
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		if (doc.querySelector("parsererror"))
			throw new Error("Malformed sitemap XML");
		if (
			doc.documentElement.namespaceURI !==
			"http://www.sitemaps.org/schemas/sitemap/0.9"
		)
			throw new Error("Missing sitemap namespace");
		return [...doc.querySelectorAll("url > loc")].map((loc) => loc.textContent);
	}, sitemap);
	assert.deepEqual(
		locations,
		production
			? [new URL("/", production).href, new URL("/changelog/", production).href]
			: [],
	);
	if (production)
		assert.match(
			robots,
			new RegExp(
				`^Sitemap: ${new URL("/sitemap.xml", production).href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
				"m",
			),
		);
	else assert.doesNotMatch(robots, /^Sitemap:/m);
	assert.doesNotMatch(
		sitemap,
		/<lastmod>/,
		"Do not invent modification dates from build time",
	);
	const linkTargets = new Set();
	for (const path of ["/", "/changelog/"]) {
		const response = await page.goto(new URL(path, origin).href);
		assert.equal(response.status(), 200);
		assert.equal(await page.locator("html").getAttribute("lang"), "en");
		assert.equal(await page.locator("h1").count(), 1);
		assert.ok((await page.locator("h1").innerText()).trim());
		for (const image of await page.locator("img").all())
			assert.notEqual(await image.getAttribute("alt"), null);
		const schemas = await page
			.locator('script[type="application/ld+json"]')
			.allTextContents();
		if (production) {
			assert.equal(schemas.length, 1);
			const graph = JSON.parse(schemas[0]);
			assert.equal(graph["@context"], "https://schema.org");
			const nodes = graph["@graph"];
			assert.equal(
				new Set(nodes.map((node) => node["@id"])).size,
				nodes.length,
			);
			const webpage = nodes.find((node) => node["@type"] === "WebPage");
			assert.equal(webpage.url, new URL(path, production).href);
			assert.equal(webpage.name, await page.title());
			assert.equal(
				webpage.description,
				await page.locator('meta[name="description"]').getAttribute("content"),
			);
			assert.equal(
				webpage.isPartOf["@id"],
				`${new URL("/", production).href}#website`,
			);
			if (path === "/") {
				const website = nodes.find((node) => node["@type"] === "WebSite");
				assert.equal(website.url, new URL("/", production).href);
				assert.equal(website.name, "YAFFW");
				const app = nodes.find((node) => node["@type"] === "WebApplication");
				assert.equal(app["@id"], webpage.about["@id"]);
				assert.equal(app.url, EDITOR_URL);
				assert.equal(app.sameAs, REPO_URL);
				assert.equal(app.applicationCategory, "MultimediaApplication");
				assert.equal(app.isAccessibleForFree, true);
				assert.match(await page.locator(".hero__meta").innerText(), /Free/);
				assert.match(app.browserRequirements, /WebCodecs.*Chrome or Edge/);
				assert.equal(
					app.image,
					await page
						.locator('meta[property="og:image"]')
						.getAttribute("content"),
				);
				assert.equal(app.aggregateRating, undefined);
				assert.equal(app.review, undefined);
			}
		} else assert.equal(schemas.length, 0);

		for (const href of await page
			.locator("a[href]")
			.evaluateAll((links) => links.map((link) => link.href))) {
			const url = new URL(href);
			if (url.origin === new URL(origin).origin) linkTargets.add(url.href);
		}
		assert.equal(
			await page
				.locator('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]')
				.count(),
			0,
		);
		await page.evaluate(() => document.fonts.ready);
		assert.ok(
			await page.evaluate(() =>
				[...document.fonts].some(
					(font) =>
						/Inter Variable/.test(font.family) && font.status === "loaded",
				),
			),
			"Self-hosted Inter must load without scripts",
		);
		const preload = await page
			.locator('link[rel="preload"][as="font"]')
			.getAttribute("href");
		assert.equal(new URL(preload, origin).origin, new URL(origin).origin);
		const font = await context.request.get(new URL(preload, origin).href);
		assert.equal(font.status(), 200);
		assert.equal((await font.body()).subarray(0, 4).toString(), "wOF2");
	}
	// Follow every emitted same-site link, including fragments on another page.
	for (const href of linkTargets) {
		// Same-document fragment navigation has no navigation Response.
		const response = await context.request.get(href);
		assert.equal(response.status(), 200, `Broken internal link: ${href}`);
		await page.goto(href);
		const fragment = decodeURIComponent(new URL(href).hash.slice(1));
		if (fragment)
			assert.ok(
				await page.evaluate(
					(id) => Boolean(document.getElementById(id)),
					fragment,
				),
				`Missing fragment: ${href}`,
			);
	}
	const missing = await page.goto(`${origin}/seo-audit-missing`);
	assert.equal(missing.status(), 404);
	assert.match(
		await page.locator('meta[name="robots"]').getAttribute("content"),
		/noindex/,
	);
	assert.equal(
		await page.locator('script[type="application/ld+json"]').count(),
		0,
	);
	if (edge) {
		for (const [path, location] of [
			["/changelog", "/changelog/"],
			["/changelog/index.html", "/changelog/"],
			["/index.html", "/"],
		]) {
			const response = await context.request.get(`${origin}${path}`, {
				maxRedirects: 0,
			});
			assert.equal(response.status(), 301);
			assert.equal(response.headers().location, location);
		}
		await page.goto(origin);
		const fontUrl = await page
			.locator('link[rel="preload"][as="font"]')
			.getAttribute("href");
		const font = await context.request.get(new URL(fontUrl, origin).href);
		assert.match(
			font.headers()["cache-control"],
			/max-age=31536000.*immutable/,
		);
	}
	console.log(
		`PASS SEO: discovery files, ${production ? "canonical structured data" : "non-indexable preview"}, ${linkTargets.size} internal links, real 404, self-hosted fonts`,
	);
	await context.close();
} finally {
	await browser.close();
}
