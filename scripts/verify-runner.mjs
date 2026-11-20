import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";

const children = new Set();
let interrupted;

export function forwardInterrupts() {
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.on(signal, () => {
			interrupted = signal;
			for (const child of children) {
				try {
					process.kill(
						process.platform === "win32" ? child.pid : -child.pid,
						signal,
					);
				} catch (error) {
					if (error.code !== "ESRCH") throw error;
				}
			}
		});
	}
}
import { performance } from "node:perf_hooks";

// Always settle after the process closes, and retain every sibling's evidence.
// A failed command is data for the final gate, never a reason to skip siblings.
export function runCommand(name, args, directory, budgetSeconds, options = {}) {
	if (interrupted)
		return Promise.resolve({ name, passed: false, signal: interrupted });
	const started = performance.now();
	const log = createWriteStream(join(directory, `${name}.log`));
	return new Promise((resolve) => {
		const child = spawn("pnpm", args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		children.add(child);
		child.stdout.pipe(log, { end: false });
		child.stderr.pipe(log, { end: false });
		child.stdout.pipe(process.stdout);
		child.stderr.pipe(process.stderr);
		let error;
		child.once("error", (cause) => {
			error = cause.message;
		});
		child.once("close", (code, signal) => {
			children.delete(child);
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
