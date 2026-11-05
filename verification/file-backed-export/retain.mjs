import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const load = (name) =>
	JSON.parse(readFileSync(`tmp/file-backed-export/${name}.json`, "utf8"));
const app = load("app-evidence");
const evidence = {
	comparison: load("summary"),
	lifecycle: load("lifecycle"),
	app: {
		...app,
		results: app.results.map(({ artifact, ...result }) => ({
			...result,
			artifact: {
				selection: artifact.selection,
				presented: {
					...artifact.presented,
					frames: {
						count: artifact.presented.frames.length,
						first: artifact.presented.frames[0],
						last: artifact.presented.frames.at(-1),
					},
				},
				audio: artifact.audio,
			},
		})),
	},
	sourceHashes: Object.fromEntries(
		[
			"src/editor-next/export/runners/default-export-runner.ts",
			"src/editor-next/export/generated-media/generated-media-delivery.ts",
			...readdirSync("verification/file-backed-export")
				.filter((f) => /\.(ts|mjs)$/.test(f))
				.map((f) => `verification/file-backed-export/${f}`),
		].map((file) => [
			file,
			createHash("sha256").update(readFileSync(file)).digest("hex"),
		]),
	),
};
writeFileSync(
	"docs/verification/evidence/file-backed-export-2026-11-06.json",
	`${JSON.stringify(evidence, null, 2)}\n`,
);
