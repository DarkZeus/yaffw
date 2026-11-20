import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { preview } from "astro";

const availableChecks = [
	"navigation",
	"mobile-navigation",
	"tabs",
	"progressive",
	"metadata",
];
const requestedChecks = process.argv.slice(2);
const checks = requestedChecks.length ? requestedChecks : availableChecks;
if (new Set(checks).size !== checks.length)
	throw new Error("Duplicate smoke checks would share output directories");
for (const check of checks) {
	if (!availableChecks.includes(check))
		throw new Error(`Unknown smoke check: ${check}`);
}

const root = new URL("../", import.meta.url);
const repository = new URL("../../", import.meta.url);
const workers = Number(process.env.YAFFW_SMOKE_WORKERS ?? 2);
if (![1, 2].includes(workers))
	throw new Error("YAFFW_SMOKE_WORKERS must be 1 or 2");
const temporaryRoot = new URL("../../tmp/", import.meta.url);
await mkdir(temporaryRoot, { recursive: true });
const output = await mkdtemp(new URL("landing-smoke-", temporaryRoot));
// Preview only the existing production build. Port 0 is assigned by the OS;
// the user's development server and other local previews are never reused.
const server = await preview({
	root: fileURLToPath(root),
	server: { host: "127.0.0.1", port: 0, open: false },
	logLevel: "error",
});

try {
	const pending = [...checks];
	const failures = [];
	await Promise.all(
		Array.from({ length: workers }, async () => {
			while (pending.length) {
				const check = pending.shift();
				const started = performance.now();
				try {
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
									YAFFW_VERIFICATION_OUTPUT: resolvePath(output, check),
								},
							},
						);
						child.once("error", reject);
						child.once("exit", (code, signal) => {
							if (code === 0) resolve();
							else
								reject(new Error(`${check} smoke failed (${signal || code})`));
						});
					});
				} catch (error) {
					failures.push(error);
					console.error(error);
				} finally {
					console.log(
						`SMOKE ${check}: ${((performance.now() - started) / 1000).toFixed(3)}s`,
					);
				}
			}
		}),
	);
	if (failures.length)
		throw new AggregateError(failures, "Landing smoke failed");
} finally {
	const closed = server.closed();
	await server.stop();
	await closed;
}
