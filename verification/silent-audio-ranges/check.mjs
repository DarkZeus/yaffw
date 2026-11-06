import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { inspect, probe } from "./artifact.mjs";
import { prepareFixture } from "./fixtures.mjs";
const require = createRequire(import.meta.url);
import { launchBrowser } from "../browser.cjs";
const { directory, source } = prepareFixture();
const fixture = probe(source);
const packets = fixture.packets.filter((p) => p.stream_index === 1);
for (const start of [0.2, 2.2, 5.3])
	assert.equal(
		packets.filter(
			(p) =>
				Number(p.pts_time) < start + 0.5 &&
				Number(p.pts_time) + Number(p.duration_time) > start,
		).length,
		0,
	);
const browser = await launchBrowser();
const label = process.argv[2] || "candidate";
const results = [];
try {
	const page = await browser.newPage();
	if (label === "baseline") {
		const baseline = execFileSync(
			"git",
			[
				"show",
				"855c5ed7:src/editor-next/media-work/adapters/mediabunny-audio-buffer.ts",
			],
			{ encoding: "utf8" },
		);
		const ts = require("typescript");
		await page.route(
			"**/src/editor-next/media-work/adapters/mediabunny-audio-buffer.ts*",
			async (route) => {
				const transformed = await (await route.fetch()).text();
				const dependency = transformed.match(
					/from "([^\"]*mediabunny\.js[^\"]*)"/,
				)[1];
				const timeline = transformed.match(
					/from "([^\"]*audio-packet-timeline[^\"]*)"/,
				)[1];
				const javascript = ts
					.transpileModule(baseline, {
						compilerOptions: {
							module: ts.ModuleKind.ESNext,
							target: ts.ScriptTarget.ESNext,
						},
					})
					.outputText.replace('from "mediabunny"', `from "${dependency}"`)
					.replace('from "./audio-packet-timeline"', `from "${timeline}"`);
				await route.fulfill({
					status: 200,
					contentType: "text/javascript",
					body: javascript,
				});
			},
		);
	}
	await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
	for (const start of [0.2, 2.2, 5.3])
		for (const mode of ["silent", "mixed", "excluded", "no-audio"]) {
			const observed = await page.evaluate(
				async (args) => {
					const harness = await import(
						"/verification/silent-audio-ranges/browser-check.ts"
					);
					return harness.checkExport(args.base64, args.start, args.mode);
				},
				{ base64: readFileSync(source).toString("base64"), start, mode },
			);
			const result = { start, mode, ok: observed.ok, error: observed.error };
			if (observed.ok) {
				const file = resolve(directory, `${label}-${start}-${mode}.mp4`);
				writeFileSync(file, Buffer.from(observed.base64, "base64"));
				try {
					result.artifact = inspect(
						file,
						mode === "silent" || mode === "mixed",
						mode === "mixed",
					);
					result.file = file;
				} catch (error) {
					result.validationError = String(error);
				}
			}
			results.push(result);
			console.log(
				`${result.ok && !result.validationError ? "PASS" : "FAIL"} ${start} ${mode}: ${result.error || result.validationError || "artifact validated"}`,
			);
		}
	writeFileSync(
		resolve(directory, `${label}.json`),
		`${JSON.stringify({ recordedAt: new Date().toISOString(), browser: await browser.version(), decoderSource: label === "baseline" ? "855c5ed7" : "working tree", sha256: createHash("sha256").update(readFileSync(source)).digest("hex"), fixture, results }, null, 2)}\n`,
	);
	if (label === "baseline") {
		assert.equal(
			results.filter(
				(r) =>
					!r.ok &&
					r.error === "The audio track decoded no presentable samples.",
			).length,
			6,
		);
		assert.equal(results.filter((r) => r.ok && !r.validationError).length, 6);
	}
	if (label !== "baseline")
		assert.ok(
			results.every((r) => r.ok && !r.validationError),
			"Every candidate export and artifact check must pass",
		);
} finally {
	await browser.close();
}
