import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { configuredProductionOrigin } from "../landing/config/site-origin.mjs";
import { validateRelease } from "./release.mjs";

const manifest = JSON.parse(readFileSync("verified/release.json", "utf8"));
const archive = readFileSync("verified/production.tar.gz");
validateRelease(manifest, archive, {
	revision: process.env.GITHUB_SHA,
	runId: process.env.GITHUB_RUN_ID,
	sha256: process.env.EXPECTED_RELEASE_DIGEST,
});
if (
	manifest.origin !==
	configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN)
)
	throw new Error(
		"Deployment origin differs from the verified production build",
	);
const master = execFileSync(
	"git",
	["ls-remote", "origin", "refs/heads/master"],
	{ encoding: "utf8" },
).split(/\s+/)[0];
if (master !== manifest.revision)
	throw new Error("Refusing a stale deployment over newer master");
mkdirSync("release", { recursive: true });
execFileSync("tar", [
	"-xzf",
	resolve("verified/production.tar.gz"),
	"-C",
	"release",
]);
console.log(`Validated immutable artifacts for ${manifest.revision}`);
