import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preview } from "astro";

const root = new URL("../", import.meta.url);
const repository = new URL("../../", import.meta.url);
// Preview only the existing production build. Port 0 is assigned by the OS;
// the user's development server and other local previews are never reused.
const server = await preview({
	root: fileURLToPath(root),
	server: { host: "127.0.0.1", port: 0, open: false },
	logLevel: "error",
});

try {
	for (const check of ["navigation", "tabs", "progressive"]) {
		await new Promise((resolve, reject) => {
			const child = spawn(
				process.execPath,
				[`verification/landing/${check}-check.mjs`],
				{
					cwd: fileURLToPath(repository),
					stdio: "inherit",
					env: {
						...process.env,
						YAFFW_LANDING_ORIGIN: `http://127.0.0.1:${server.port}`,
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
	const closed = server.closed();
	await server.stop();
	await closed;
}
