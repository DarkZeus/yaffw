import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { availableParallelism, totalmem } from "node:os";
import { relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { forwardInterrupts, runCommand, runLanes } from "./verify-runner.mjs";

const [major, minor] = process.versions.node.split(".").map(Number);
if (
	!((major === 24 && minor >= 16) || (major === 26 && minor >= 3) || major > 26)
)
	throw new Error("Verification requires package.json's supported Node engine");
const scope =
	process.argv.length === 2
		? "all"
		: process.argv[2] === "--ci-lane"
			? process.argv[3]
			: undefined;
if (
	![2, 4].includes(process.argv.length) ||
	!["all", "editor", "landing"].includes(scope) ||
	(scope !== "all" && process.env.GITHUB_ACTIONS !== "true")
)
	throw new Error(
		"pnpm verify is complete; CI lanes require the full workflow aggregator",
	);
const started = performance.now();
forwardInterrupts();
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
	encoding: "utf8",
}).trim();
const workingTreeDirty = Boolean(
	execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
		encoding: "utf8",
	}).trim(),
);
await mkdir("tmp", { recursive: true });
const directory = await mkdtemp(resolve("tmp/verify-"));
const seed = Number(process.env.YAFFW_TEST_SEED ?? 20261120);
if (!Number.isSafeInteger(seed)) throw new Error("Invalid YAFFW_TEST_SEED");
const workers = Math.min(
	4,
	scope === "editor"
		? availableParallelism()
		: Math.max(1, availableParallelism() - 1),
);
const results = [];
const testsDone = Promise.withResolvers();
const rootDone = Promise.withResolvers();
const landingBuilt = Promise.withResolvers();
const landingChecked = Promise.withResolvers();
if (scope === "editor") landingBuilt.resolve();
if (scope === "landing") {
	rootDone.resolve();
	testsDone.resolve();
}
async function phase(name, args, budget) {
	const result = await runCommand(name, args, directory, budget);
	results.push(result);
	return result.passed;
}
const landing = (script) => ["--filter", "yaffw-landing", script];
const inventory =
	scope === "landing"
		? []
		: execFileSync("pnpm", ["exec", "vitest", "list", "--filesOnly"], {
				encoding: "utf8",
			})
				.trim()
				.split("\n")
				.filter(Boolean)
				.sort();
await writeFile(
	resolve(directory, "expected-tests.json"),
	JSON.stringify(inventory, null, 2),
);
console.log(
	`VERIFY_ENV ${JSON.stringify({ scope, node: process.version, cpu: availableParallelism(), memoryBytes: totalmem(), workers, seed, directory, inventoryFiles: inventory.length })}`,
);

const plan = [
	async () => {
		// Astro check and build both generate .astro state. Keep that state
		// single-writer on the dedicated landing runner.
		if (scope === "landing") await landingChecked.promise;
		let built;
		try {
			built = await phase("landing-build", landing("build:production"), 50);
		} finally {
			landingBuilt.resolve();
		}
		if (built) {
			await phase("landing-smoke", landing("test:smoke"), 35);
		} else {
			results.push({
				name: "landing-smoke",
				passed: false,
				blockedBy: "landing-build",
			});
		}
	},
	async () => {
		// Cold AVIF transforms competed with all test workers and inflated
		// both commands. Warm cached builds release this barrier in seconds.
		await Promise.all([rootDone.promise, landingBuilt.promise]);
		try {
			await phase(
				"tests",
				[
					"exec",
					"vitest",
					"run",
					`--maxWorkers=${workers}`,
					"--sequence.shuffle",
					`--sequence.seed=${seed}`,
					"--reporter=default",
					"--reporter=json",
					`--outputFile.json=${resolve(directory, "vitest.json")}`,
				],
				30,
			);
		} finally {
			testsDone.resolve();
		}
	},
	async () => {
		try {
			await phase("root-format", ["format:check"], 2);
			await phase("root-lint", ["lint"], 4);
		} finally {
			rootDone.resolve();
		}
	},
	async () => {
		await phase("editor-typecheck", ["typecheck"], 5);
	},
	async () => {
		await phase("editor-build", ["exec", "vite", "build"], 5);
	},
	async () => {
		try {
			await phase("landing-format", landing("format:check"), 3);
			await phase("landing-lint", landing("lint"), 5);
			// Local full verification keeps Astro's TS6 off the test workers.
			await testsDone.promise;
			await phase("landing-typecheck", landing("typecheck"), 10);
		} finally {
			landingChecked.resolve();
		}
	},
];
const owners = ["landing", "editor", "editor", "editor", "editor", "landing"];
await runLanes(
	plan.filter((_run, index) => scope === "all" || owners[index] === scope),
	3,
);

// Compare actual execution to discovery, not a maintained list that can silently
// omit newly added files. Reject skipped/todo tests as well as missing files.
let inventoryPassed = null;
if (scope !== "landing")
	try {
		const report = JSON.parse(
			await readFile(resolve(directory, "vitest.json"), "utf8"),
		);
		const executed = report.testResults
			.map((file) => relative(process.cwd(), file.name))
			.sort();
		inventoryPassed =
			JSON.stringify(executed) === JSON.stringify(inventory) &&
			report.numPendingTests === 0 &&
			report.numTodoTests === 0 &&
			report.numFailedTests === 0 &&
			report.success === true;
	} catch (error) {
		console.error("Missing or invalid test execution report", error);
	}
const seconds = (performance.now() - started) / 1000;
const expected = {
	editor: [
		"root-format",
		"root-lint",
		"editor-typecheck",
		"editor-build",
		"tests",
	],
	landing: [
		"landing-format",
		"landing-lint",
		"landing-typecheck",
		"landing-build",
		"landing-smoke",
	],
};
const names =
	scope === "all" ? [...expected.editor, ...expected.landing] : expected[scope];
const correctnessPassed =
	results.length === names.length &&
	new Set(results.map((result) => result.name)).size === names.length &&
	results.every((result) => result.passed && names.includes(result.name)) &&
	(scope === "landing" || inventoryPassed === true);
const budgetsPassed =
	results.every((result) => result.withinBudget) && seconds < 120;
const summary = {
	scope,
	revision,
	workingTreeDirty,
	correctnessPassed,
	budgetsPassed,
	inventoryPassed,
	seconds,
	seed,
	results,
};
await writeFile(
	resolve(directory, "summary.json"),
	JSON.stringify(summary, null, 2),
);
if (process.env.GITHUB_OUTPUT)
	await writeFile(
		process.env.GITHUB_OUTPUT,
		`evidence=${directory}\ncorrectness=${correctnessPassed}\n`,
		{ flag: "a" },
	);
console.log(`VERIFY_RESULT ${JSON.stringify(summary)}`);
console.log(`Full logs and timing evidence: ${directory}`);
process.exitCode =
	correctnessPassed && (process.env.CI !== "true" || budgetsPassed) ? 0 : 1;
