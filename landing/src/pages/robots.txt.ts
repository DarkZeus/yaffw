import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
	new Response(
		[
			"User-agent: *",
			"Allow: /",
			// Previews remain crawlable so their HTML noindex can be read.
			...(site ? [`Sitemap: ${new URL("/sitemap.xml", site).href}`] : []),
			"",
		].join("\n"),
		{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
	);
