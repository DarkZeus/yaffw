import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

// Always settle after the process closes, and retain every sibling's evidence.
// A failed command is data for the final gate, never a reason to skip siblings.
export function runCommand(name, args, directory, budgetSeconds, options = {}) {
	const started = performance.now();
	const log = createWriteStream(join(directory, `${name}.log`));
	return new Promise((resolve) => {
		const child = spawn("pnpm", args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout.pipe(log, { end: false });
		child.stderr.pipe(log, { end: false });
		child.stdout.pipe(process.stdout);
		child.stderr.pipe(process.stderr);
		let error;
		child.once("error", (cause) => {
			error = cause.message;
		});
		child.once("close", (code, signal) => {
			const seconds = (performance.now() - started) / 1000;
			const result = {
				name,
				args,
				seconds,
				budgetSeconds,
				code,
				signal,
				error,
				passed: code === 0 && !signal && !error,
				withinBudget: seconds < budgetSeconds,
			};
			log.end(() => {
				console.log(`VERIFY_PHASE ${JSON.stringify(result)}`);
				resolve(result);
			});
		});
	});
}

export async function runLanes(lanes, concurrency) {
	const pending = [...lanes];
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			while (pending.length) await pending.shift()();
		}),
	);
}
