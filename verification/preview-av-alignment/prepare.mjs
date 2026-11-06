import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");

export async function bundle(file, format) {
	return (
		await build({
			entryPoints: [path.join(directory, file)],
			bundle: true,
			write: false,
			platform: "browser",
			format,
		})
	).outputFiles[0].text;
}

export async function prepareAlignmentMeasurement() {
	const fixture = JSON.parse(
		await readFile(path.join(directory, "fixture-manifest.json"), "utf8"),
	);
	const fixturePath = path.join(root, "public", fixture.url);
	assert.equal(
		createHash("sha256")
			.update(await readFile(fixturePath))
			.digest("hex"),
		fixture.sha256,
	);
	const collector = await bundle("collector.ts", "iife");
	const analysis = await bundle("report.ts", "esm");
	const report = await import(
		`data:text/javascript;base64,${Buffer.from(analysis).toString("base64")}`
	);
	const pilot = process.env.YAFFW_AV_PILOT === "1";
	const repetitions = Number(
		process.env.YAFFW_AV_REPETITIONS || (pilot ? 1 : 5),
	);
	assert.ok(Number.isInteger(repetitions) && repetitions > 0);
	return {
		root,
		fixture,
		fixturePath,
		collector,
		report,
		pilot,
		repetitions,
		headless: process.env.YAFFW_HEADED !== "1",
	};
}
