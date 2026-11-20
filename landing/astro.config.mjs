import { defineConfig } from "astro/config";
import { configuredProductionOrigin } from "./config/site-origin.mjs";

// Static output, served by the `yaffw-landing` Worker (see wrangler.jsonc).
export default defineConfig({
	site: configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN),
	server: { port: 4173 },
	devToolbar: { enabled: false },
});
