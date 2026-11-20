import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { configuredProductionOrigin } from "../landing/config/site-origin.mjs";
import { validateRelease } from "./release.mjs";

const master = execFileSync(
	"git",
	["ls-remote", "origin", "refs/heads/master"],
	{ encoding: "utf8" },
).split(/\s+/)[0];
if (master !== process.env.GITHUB_SHA)
	throw new Error("Refusing a stale deployment over newer master");
mkdirSync("release", { recursive: true });
for (const scope of ["editor", "landing"]) {
	const directory = resolve("verified", scope);
	const manifest = JSON.parse(
		readFileSync(resolve(directory, "release.json"), "utf8"),
	);
	const archive = readFileSync(resolve(directory, "production.tar.gz"));
	validateRelease(manifest, archive, {
		scope,
		revision: process.env.GITHUB_SHA,
		runId: process.env.GITHUB_RUN_ID,
		sha256:
			process.env[
				scope === "editor"
					? "EXPECTED_EDITOR_DIGEST"
					: "EXPECTED_LANDING_DIGEST"
			],
	});
	if (
		manifest.origin !==
		configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN)
	)
		throw new Error(
			"Deployment origin differs from the verified production build",
		);
	execFileSync("tar", [
		"-xzf",
		resolve(directory, "production.tar.gz"),
		"-C",
		"release",
	]);
}
console.log(`Validated both immutable artifacts for ${process.env.GITHUB_SHA}`);
