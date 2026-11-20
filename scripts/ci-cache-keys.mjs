import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const inputs = [
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"package.json",
	"landing/package.json",
	".npmrc",
	"patches/mediabunny@1.65.2.patch",
];
const digest = createHash("sha256");
for (const path of inputs) {
	digest.update(path);
	if (existsSync(path)) digest.update(readFileSync(path));
}
// Must work before a cold install. The pinned Playwright version plus the
// frozen lock integrity identifies its exact bundled browser revisions.
const playwrightVersion = JSON.parse(readFileSync("package.json", "utf8"))
	.devDependencies.playwright;
const browserHash = createHash("sha256")
	.update(readFileSync("pnpm-lock.yaml"))
	.digest("hex");
const platform = `${process.platform}-${process.arch}-${process.env.ImageOS}-${process.env.CI_RUNNER_IMAGE || "host"}`;
const mode = process.env.DEPENDENCY_CACHE_MODE || "store";
if (!["store", "modules", "cold"].includes(mode))
	throw new Error("Invalid cache mode");
const salt = process.env.CACHE_SALT || "v1";
// The content-addressed store and browser/image assets are reusable across
// runner-image refreshes. Installed dependencies stay image/Node-patch exact.
// Both paths still run frozen install, native ABI validation and all checks.
const nativePlatform =
	mode === "modules"
		? `${platform}-${process.env.ImageVersion}-node${process.versions.node}`
		: `${platform}-node${process.versions.node.split(".")[0]}`;
const dependencyKey = `${mode}-${nativePlatform}-abi${process.versions.modules}-pnpm10.33.0-${digest.digest("hex")}-${salt}`;
const browserKey = `chromium-${platform}-${playwrightVersion}-${browserHash}-${salt}`;
const imageKey = `astro-images-${platform}-${createHash("sha256").update(readFileSync("pnpm-lock.yaml")).digest("hex")}-${salt}`;
const cachePath =
	mode === "modules"
		? "node_modules\nlanding/node_modules"
		: execFileSync("pnpm", ["store", "path", "--silent"], {
				encoding: "utf8",
			}).trim();
const output = `dependencies=${dependencyKey}\nbrowser=${browserKey}\nimages=${imageKey}\npath<<CACHE_PATH\n${cachePath}\nCACHE_PATH\n`;
console.log(output);
if (process.env.GITHUB_OUTPUT)
	appendFileSync(process.env.GITHUB_OUTPUT, output);
