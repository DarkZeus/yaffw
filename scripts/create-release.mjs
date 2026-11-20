import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { configuredProductionOrigin } from "../landing/config/site-origin.mjs";
import { releaseDigest } from "./release.mjs";

const evidence = JSON.parse(
	readFileSync(resolve(process.argv[2], "summary.json"), "utf8"),
);
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
	encoding: "utf8",
}).trim();
const dirty = execFileSync(
	"git",
	["status", "--porcelain", "--untracked-files=all"],
	{ encoding: "utf8" },
).trim();
if (
	!process.env.GITHUB_RUN_ID ||
	revision !== process.env.GITHUB_SHA ||
	dirty ||
	evidence.revision !== revision ||
	evidence.workingTreeDirty ||
	!evidence.correctnessPassed ||
	!evidence.budgetsPassed
)
	throw new Error(
		"Only a complete, clean, successful verification can publish artifacts",
	);
const origin = configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN);
if (!origin) throw new Error("A production landing origin is required");
const directory = resolve(`tmp/production-${process.env.GITHUB_RUN_ID}`);
mkdirSync(directory, { recursive: true });
const archive = resolve(directory, "production.tar.gz");
execFileSync("tar", [
	"-czf",
	archive,
	"dist",
	"landing/dist",
	"wrangler.jsonc",
	"landing/wrangler.jsonc",
]);
const sha256 = releaseDigest(readFileSync(archive));
writeFileSync(
	resolve(directory, "release.json"),
	JSON.stringify(
		{ revision, runId: process.env.GITHUB_RUN_ID, sha256, origin },
		null,
		2,
	),
);
appendFileSync(
	process.env.GITHUB_OUTPUT,
	`directory=${directory}\nsha256=${sha256}\n`,
);
