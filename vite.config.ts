/// <reference types="vitest/config" />

import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		tanstackRouter({ autoCodeSplitting: true }),
		viteReact(),
		tailwindcss(),
	],
	server: {
		port: 3000,
		open: true,
		host: true,
	},
	test: {
		setupFiles: ["./src/vitest.setup.ts"],
		coverage: {
			provider: "istanbul",
			include: ["src/**/*.{ts,tsx}"],
			reporter: ["text", "json", "json-summary", "html"],
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
});
