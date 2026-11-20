import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const updates = readFileSync(0, "utf8").trim().split("\n").filter(Boolean);
if (updates.length) {
	const started = performance.now();
	const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
	const head = git(["rev-parse", "HEAD"]);
	if (git(["branch", "--show-current"]) !== "master")
		throw new Error("Direct-master verification must run on master");
	for (const update of updates) {
		const [localRef, sha, remoteRef] = update.split(/\s+/);
		if (
			localRef !== "refs/heads/master" ||
			remoteRef !== "refs/heads/master" ||
			sha !== head
		)
			throw new Error(
				"Pre-push verification supports only the current master revision",
			);
	}
	if (git(["status", "--porcelain", "--untracked-files=all"]))
		throw new Error(
			"Commit or set aside working changes before verifying the exact pushed revision",
		);
	const result = spawnSync("pnpm", ["verify"], { stdio: "inherit" });
	if (result.error) throw result.error;
	console.log(
		`PRE_PUSH_RESULT ${JSON.stringify({ revision: head, seconds: (performance.now() - started) / 1000, code: result.status, signal: result.signal })}`,
	);
	process.exitCode = result.status === 0 && !result.signal ? 0 : 1;
}
