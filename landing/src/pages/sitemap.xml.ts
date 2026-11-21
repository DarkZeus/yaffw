import type { APIRoute } from "astro";
import { indexablePaths } from "../site";

export const GET: APIRoute = ({ site }) => {
	// Keep this aligned with canonical metadata, including explicit preview builds.
	const urls = site
		? indexablePaths.map(
				(path) => `<url><loc>${new URL(path, site).href}</loc></url>`,
			)
		: [];
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`,
		{ headers: { "Content-Type": "application/xml; charset=utf-8" } },
	);
};
