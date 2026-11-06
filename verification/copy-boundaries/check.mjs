import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	inspectArtifact,
	inspectSource,
	measurePresentedBoundaryEvidence,
} from "./artifact.mjs";
import { generateFixtures } from "./fixtures.mjs";

import { launchBrowser } from "../browser.cjs";
const directory = resolve("tmp/copy-boundaries");
mkdirSync(directory, { recursive: true });
assert.equal(
	JSON.parse(readFileSync("node_modules/mediabunny/package.json", "utf8"))
		.version,
	"1.65.2",
);
const fixtures = generateFixtures();
for (const fixture of fixtures)
	fixture.source = await inspectSource(fixture.file);
const browser = await launchBrowser();
const results = [];
const origin = process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000";
const policies = [
	{ name: "default", tolerance: null },
	{ name: "50ms", tolerance: 0.05 },
	{ name: "zero", tolerance: 0 },
];
const containers = ["mp4", "mov", "mkv", "webm", "mpeg-ts"];
const repeats = Number(process.env.YAFFW_REPEATS || 2);
try {
	for (let repetition = 0; repetition < repeats; repetition++)
		for (const fixture of fixtures)
			for (const container of containers)
				for (const scenario of [
					"off-keyframe",
					...(fixture.kind === "vfr" && ["mp4", "mov"].includes(container)
						? ["near-keyframe"]
						: []),
					...(fixture.kind === "cfr" && container === "mp4"
						? ["no-audio"]
						: []),
				])
					for (const policy of repetition % 2
						? [...policies].reverse()
						: policies) {
						const start =
							scenario === "near-keyframe"
								? 5.013
								: fixture.kind === "vfr"
									? 2.137
									: 1.137;
						const end =
							scenario === "near-keyframe"
								? 7.283
								: fixture.kind === "vfr"
									? 6.283
									: 5.283;
						const file = resolve(
							directory,
							`${fixture.kind}-${container}-${scenario}-${policy.name}-${repetition}.${container === "mpeg-ts" ? "ts" : container}`,
						);
						const page = await browser.newPage();
						await page.routeWebSocket("**", (socket) => socket.close());
						let overrides = 0;
						if (policy.tolerance !== null)
							await page.route(
								"**/src/editor-next/export/runners/default-export-runner.ts*",
								async (route) => {
									const response = await route.fetch();
									const original = await response.text();
									const pattern = /copy:\s*\{\s*shiftTolerance:\s*0\s*\}/g;
									assert.equal([...original.matchAll(pattern)].length, 1);
									overrides++;
									await route.fulfill({
										response,
										body: original.replace(
											pattern,
											`copy: { shiftTolerance: 0, boundaryTolerance: ${policy.tolerance} }`,
										),
									});
								},
							);
						let artifact;
						await page.exposeFunction("measureBoundary", async (base64) => {
							writeFileSync(file, Buffer.from(base64, "base64"));
							artifact = await inspectArtifact(file, fixture.source, {
								start,
								end,
							});
							return measurePresentedBoundaryEvidence(artifact.presented, {
								start,
								end,
							});
						});
						try {
							await page.goto(origin);
							const observed = await page.evaluate(
								async (args) => {
									const harness = await import(
										"/verification/copy-boundaries/browser-check.ts"
									);
									return harness.checkExport(args);
								},
								{
									base64: readFileSync(fixture.file).toString("base64"),
									container,
									start,
									end,
									noAudio: scenario === "no-audio",
								},
							);
							assert.equal(overrides, policy.tolerance === null ? 0 : 1);
							assert.ok(artifact);
							assert.equal(
								observed.audioEncodeCalls > 0,
								scenario !== "no-audio",
								"Generated audio mix encoded independently; No audio skips encoding",
							);
							assert.equal(artifact.audio !== null, scenario !== "no-audio");
							assert.ok(artifact.presented.frames.length > 0);
							if (observed.nativeEndpoints?.status === "observed") {
								assert.equal(
									observed.nativeEndpoints.firstId,
									artifact.presented.frames[0].id,
									"Chromium and independent decoder present the same first frame",
								);
								assert.equal(
									observed.nativeEndpoints.lastId,
									artifact.presented.frames.at(-1).id,
									"Chromium and independent decoder present the same last frame",
								);
							}
							if (Number.isFinite(artifact.presented.end))
								assert.equal(
									observed.report.boundaryEvidence.kind,
									"start-and-end",
								);
							const avEvents = (artifact.audio?.clicks ?? []).map((click) => {
								const flash = artifact.presented.flashes.find(
									(f) => Math.round(f.sourcePts) === click.sourceSecond,
								);
								const sourceFlash = fixture.source.video.flashes.find(
									(f) => Math.round(f.pts) === click.sourceSecond,
								);
								return {
									sourceSecond: click.sourceSecond,
									audioPts: click.pts,
									videoPts: flash?.pts,
									avDeltaMs: flash ? (click.pts - flash.pts) * 1000 : null,
									addedDeltaMs:
										flash && sourceFlash
											? (click.pts -
													flash.pts -
													(click.inferredSourcePts - sourceFlash.pts)) *
												1000
											: null,
								};
							});
							assert.ok(scenario === "no-audio" || avEvents.length >= 2);
							assert.ok(
								avEvents.every(
									(event) =>
										event.addedDeltaMs !== null &&
										Math.abs(event.addedDeltaMs) < 40,
								),
								"Generated mix/video event alignment within 40ms of source",
							);
							const bytes = readFileSync(file);
							results.push({
								repetition,
								fixture: fixture.kind,
								container,
								scenario,
								avEvents,
								policy: policy.name,
								selection: { start, end },
								overrides,
								...observed,
								sha256: createHash("sha256").update(bytes).digest("hex"),
								artifact,
							});
							console.log(
								`PASS ${repetition} ${fixture.kind} ${container} ${scenario} ${policy.name} encodes=${observed.videoEncodeCalls} start=${observed.report.rangeAccuracy.startDeltaUs} end=${observed.report.rangeAccuracy.endDeltaUs}`,
							);
						} finally {
							await page.close();
						}
						writeFileSync(
							resolve(directory, "evidence.json"),
							`${JSON.stringify({ recordedAt: new Date().toISOString(), browser: await browser.version(), mediabunny: "1.65.2", runnerSha256: createHash("sha256").update(readFileSync("src/editor-next/export/runners/default-export-runner.ts")).digest("hex"), fixtures, results }, null, 2)}\n`,
						);
					}
} finally {
	await browser.close();
}
