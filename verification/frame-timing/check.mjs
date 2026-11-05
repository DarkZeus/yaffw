import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import {
	fixtureDirectory,
	fixtures,
	generateFixtures,
	probeFixture,
} from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const origin = process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000";
const output = resolve(process.argv[2] || "tmp/frame-timing/evidence.json");
const packageJson = JSON.parse(
	readFileSync("node_modules/mediabunny/package.json", "utf8"),
);
assert.equal(
	packageJson.version,
	"1.65.2",
	"This proof targets the pinned dependency; upgrade verification is separate",
);
generateFixtures();

function close(actual, expected, message) {
	assert.ok(
		Math.abs(actual - expected) < 0.001,
		`${message}: expected ${expected}, got ${actual}`,
	);
}

function assertFixture(name, probe, metrics, timing) {
	assert.equal(
		timing.frameDurationUs,
		Math.max(1, Math.round(1_000_000 / timing.fps)),
	);
	if (name === "single-frame") {
		assert.equal(probe.packetCount, 1);
		assert.equal(metrics.probedPacketCount, 1);
		assert.equal(timing.source, "estimated");
		assert.equal(
			timing.analysis,
			null,
			"One timestamp is not evidence of a frame interval",
		);
		assert.equal(timing.fps, 30);
		assert.ok(timing.reason.length > 0);
		return;
	}
	assert.equal(
		metrics.probedPacketCount,
		256,
		"No B-frame fixture should need to read past the explicit bounded target",
	);
	const { bestGuessFrameRate: _bestGuessFrameRate, ...analysis } = metrics;
	assert.deepEqual(
		timing.analysis,
		analysis,
		"Production retains the measured metrics without inventing certainty",
	);
	if (name === "vfr") {
		assert.ok(
			probe.maxGap - probe.minGap > 0.02,
			"ffprobe independently sees nonuniform presentation intervals",
		);
		assert.equal(metrics.underlyingFrameRate, null);
		assert.equal(metrics.frameRateIsConstant, false);
		assert.equal(timing.source, "estimated");
		assert.ok(timing.reason.length > 0);
		assert.equal(
			timing.fps,
			metrics.bestGuessFrameRate,
			"Retain the measured estimate for navigation",
		);
		assert.notEqual(
			timing.fps,
			30,
			"A measured estimate is not replaced with the generic fallback rate",
		);
		return;
	}
	assert.equal(timing.source, "known");
	close(
		timing.fps,
		name === "fractional-cfr" ? 30000 / 1001 : 30,
		"Underlying rate",
	);
	if (name === "dropped-cfr") {
		close(
			probe.maxGap / probe.minGap,
			2,
			"Dropped frame leaves a two-frame timestamp gap",
		);
		assert.equal(metrics.frameRateIsConstant, false);
	} else {
		assert.equal(metrics.frameRateIsConstant, true);
	}
	if (name === "nonzero-start")
		close(probe.firstTimestamp, 2, "Nonzero first timestamp retained by muxer");
}

const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
try {
	const page = await browser.newPage();
	const browserErrors = [];
	page.on("pageerror", (error) => browserErrors.push(String(error)));
	await page.goto(origin);
	const results = [];
	for (const { name } of fixtures) {
		const bytes = readFileSync(resolve(fixtureDirectory, `${name}.mp4`));
		const probe = probeFixture(name);
		const input = new Input({
			formats: ALL_FORMATS,
			source: new BufferSource(bytes),
		});
		let nodeMetrics;
		try {
			const track = await input.getPrimaryVideoTrack();
			assert.ok(track);
			nodeMetrics = await track.computeFrameRateMetrics({
				targetPacketCount: 256,
			});
		} finally {
			input.dispose();
		}
		const observed = await page.evaluate(
			async ({ name, base64 }) => {
				const { analyzeFixture } = await import(
					"/verification/frame-timing/browser-analysis.ts"
				);
				return analyzeFixture(name, base64);
			},
			{ name, base64: bytes.toString("base64") },
		);
		assert.deepEqual(
			observed.boundedMetrics,
			nodeMetrics,
			"Independent Node and browser dependency runs agree",
		);
		assertFixture(name, probe, observed.boundedMetrics, observed.frameTiming);
		assert.equal(
			observed.wholeFileMetrics.probedPacketCount,
			probe.packetCount,
			"Whole-file metric pass covers every ffprobe packet",
		);
		if (name === "late-vfr") {
			assert.ok(probe.maxGap - probe.minGap > 0.02);
			assert.equal(
				observed.wholeFileMetrics.underlyingFrameRate,
				null,
				"Later timestamps invalidate an inferred uniform lattice",
			);
			assert.equal(observed.wholeFileMetrics.frameRateIsConstant, false);
		}
		const { presentationTimestamps, ...probeSummary } = probe;
		results.push({
			name,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			sizeBytes: bytes.length,
			ffprobe: probeSummary,
			nodeMetrics,
			...observed,
		});
		console.log(
			`${name}: ${observed.frameTiming.source}, ${observed.frameTiming.fps} fps, ${observed.boundedMetrics.probedPacketCount}/${probe.packetCount} packets`,
		);
	}
	assert.deepEqual(browserErrors, []);
	const evidence = {
		recordedAt: new Date().toISOString(),
		origin,
		browser: await browser.version(),
		userAgent: await page.evaluate(() => navigator.userAgent),
		node: process.version,
		mediabunny: packageJson.version,
		ffmpeg: execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0],
		ffprobe: execFileSync("ffprobe", ["-version"]).toString().split("\n")[0],
		results,
		browserErrors,
		limitations: [
			"Headless Chromium analysis and actual packet timestamps are verified; physical playback, decoding quality and exact visual frame stepping are not.",
			"Bounded metrics describe the inspected timestamp sample, not a whole-file CFR guarantee. The late-vfr fixture intentionally demonstrates the difference.",
			"These synthetic H.264 MP4 fixtures have no B-frames or audio; packet reorder, additional containers/codecs and multi-track media are not covered.",
			"Fixture byte hashes identify this run; ffmpeg/libx264 versions can change generated bytes. Assertions target timestamp semantics rather than byte identity.",
		],
	};
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
	console.log(`PASS: ${results.length} real fixtures; evidence ${output}`);
} finally {
	await browser.close();
}
