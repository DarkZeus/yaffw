import { defineConfig } from "astro/config";

// Static output, served by the `yaffw-landing` Worker (see wrangler.jsonc).
export default defineConfig({
	server: { port: 4173 },
	devToolbar: { enabled: false },
});
