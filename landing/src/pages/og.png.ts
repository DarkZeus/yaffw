import { readFile } from "node:fs/promises";
import { Renderer } from "@takumi-rs/core";
import type { APIRoute } from "astro";
import brand from "../../public/assets/icon-192.png?inline";
import card from "../social/card.html?raw";
import landingStyles from "../styles/base.css?raw";

/** Astro prerenders this endpoint once. No renderer or browser runs on the Worker. */
export const GET: APIRoute = async () => {
	const renderer = new Renderer();
	await renderer.registerFont({
		name: "Inter",
		data: await readFile(
			new URL(
				import.meta
					.resolve("@fontsource-variable/inter/files/inter-latin-standard-normal.woff2"),
			),
		),
	});
	const png = await renderer.render(card, {
		width: 1200,
		height: 630,
		format: "png",
		css: [landingStyles],
		fontFamilies: ["Inter"],
		images: [
			{
				src: "brand",
				data: Buffer.from(brand.slice(brand.indexOf(",") + 1), "base64"),
			},
		],
	});
	return new Response(png, { headers: { "Content-Type": "image/png" } });
};
