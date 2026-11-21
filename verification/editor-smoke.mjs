import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { launchBrowser } from "./browser.cjs";

const availableChecks = {
	seo: "editor-seo-check.mjs",
	session: "editor-session-check.mjs",
	workflow: "mediabunny-upgrade/app-check.cjs",
	boundaries: "copy-boundaries/app-check.mjs",
	silence: "silent-audio-ranges/app-check.mjs",
	bitrate: "custom-bitrate/app-check.mjs",
	appearance: "workbench-appearance-check.mjs",
};
const requested = process.argv.slice(2);
const checks = requested.length ? requested : Object.keys(availableChecks);
for (const check of checks) {
	if (!Object.hasOwn(availableChecks, check))
		throw new Error(`Unknown editor smoke check: ${check}`);
}
// Artifact assertions use an independent decoder, never the mocked unit runner.
for (const command of ["ffmpeg", "ffprobe"])
	execFileSync(command, ["-version"], { stdio: "ignore" });

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await preview({
	root,
	configFile: false,
	preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
	logLevel: "error",
});
try {
	const address = server.httpServer.address();
	if (!address || typeof address === "string")
		throw new Error("Editor preview did not acquire a loopback port");
	const origin = `http://127.0.0.1:${address.port}`;
	console.log(`Built editor ${origin}`);
	if (checks.some((check) => check === "workflow" || check === "boundaries")) {
		const browser = await launchBrowser();
		try {
			const page = await browser.newPage();
			await page.goto(origin);
			const aac = await page.evaluate(async () => {
				if (typeof AudioEncoder === "undefined") return false;
				return (
					await AudioEncoder.isConfigSupported({
						codec: "mp4a.40.2",
						sampleRate: 48000,
						numberOfChannels: 2,
						bitrate: 128000,
					})
				).supported;
			});
			assert.ok(
				aac,
				"Real default-profile exports require native AAC encoding. Use a supported Chromium platform (CI uses macOS); no export check was skipped.",
			);
		} finally {
			await browser.close();
		}
	}
	for (const check of checks) {
		await new Promise((resolve, reject) => {
			const child = spawn(
				process.execPath,
				[`verification/${availableChecks[check]}`],
				{
					cwd: root,
					stdio: "inherit",
					timeout: 180_000,
					env: {
						...process.env,
						YAFFW_ORIGIN: origin,
						YAFFW_EDITOR_ORIGIN: origin,
						YAFFW_REGENERATE_FIXTURE: "1",
					},
				},
			);
			child.once("error", reject);
			child.once("exit", (code, signal) => {
				if (code === 0) resolve();
				else reject(new Error(`${check} smoke failed (${signal || code})`));
			});
		});
	}
} finally {
	await server.close();
}
