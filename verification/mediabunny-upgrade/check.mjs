import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { generateFixtures } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.YAFFW_PLAYWRIGHT_PATH || "playwright");
const version = JSON.parse(
	readFileSync("node_modules/mediabunny/package.json", "utf8"),
).version;
assert.equal(version, "1.65.2");
const fixtures = generateFixtures();
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
});
const output = resolve(
	process.argv[2] || "tmp/mediabunny-upgrade/evidence.json",
);
try {
	const page = await browser.newPage();
	await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
	const results = [];
	for (const fixture of fixtures) {
		const observed = await page.evaluate(
			async ({ kind, base64 }) => {
				const harness = await import(
					"/verification/mediabunny-upgrade/browser-check.ts"
				);
				return kind === "video"
					? harness.checkVideo(base64)
					: harness.checkAudio(base64, kind === "sync");
			},
			{ kind: fixture.kind, base64: fixture.bytes.toString("base64") },
		);
		if (fixture.kind === "video") {
			const packets = fixture.probe.packets.filter(
				(packet) => packet.codec_type === "video",
			);
			for (const entry of observed.lookup) {
				const expectedKey = Math.max(
					...packets
						.filter((packet) => packet.flags.includes("K"))
						.map((packet) => Number(packet.pts_time))
						.filter((time) => time <= entry.target),
				);
				assert.ok(
					Math.abs(entry.key - expectedKey) < 0.00001,
					`Key packet lookup ${entry.target}`,
				);
				const expected = Math.max(
					...packets
						.map((packet) => Number(packet.pts_time))
						.filter((time) => time <= entry.target),
				);
				assert.ok(
					Math.abs(entry.packet - expected) < 0.00001,
					`Packet lookup ${entry.target}`,
				);
				assert.ok(
					entry.key <= entry.target && entry.target - entry.key < 20.1,
					"Sparse keyframe lookup",
				);
			}
			for (const [index, entry] of observed.scrub.entries())
				assert.equal(
					entry.actual,
					observed.lookup[index].packet,
					"Production scrub presents the packet at target after late, forward, reverse and GOP seeks",
				);
			assert.equal(observed.strip.length, observed.lookup.length);
			assert.ok(observed.strip.every((frame) => frame.bytes > 0));
		} else if (fixture.kind === "sync") {
			for (const result of observed.results)
				for (const key of ["mixOnsets", "previewOnsets"]) {
					const expected = Array.from(
						{ length: 9 },
						(_, index) => index + 1.021,
					).filter((time) => time > result.start);
					assert.equal(
						result[key].length,
						expected.length,
						`${key} click count from ${result.start}`,
					);
					for (const [index, time] of result[key].entries())
						assert.ok(
							Math.abs(time - expected[index]) < 0.015,
							`${key} click ${index} from ${result.start}: ${time} vs ${expected[index]}`,
						);
				}
		} else {
			if (!fixture.name.startsWith("libvorbis"))
				assert.ok(
					observed.firstPacketTimestamp < 0,
					"Encoder priming presents negative preroll to production consumers",
				);
			for (const result of observed.results)
				for (const probe of result.probes)
					for (const path of ["mixRms", "previewRms"]) {
						const silent = fixture.gap && probe.time === 2.5;
						assert.ok(
							silent ? probe[path] < 0.001 : probe[path] > 0.03,
							`${fixture.name} start=${result.start} at=${probe.time} ${path}=${probe[path]} expected ${silent ? "silence" : "tone"}`,
						);
					}
		}
		const packetTimes = fixture.probe.packets
			.map((packet) => Number(packet.pts_time))
			.filter(Number.isFinite);
		results.push({
			name: fixture.name,
			cuePoints: fixture.cuePoints,
			originalCuePoints: fixture.originalCuePoints,
			sha256: createHash("sha256").update(fixture.bytes).digest("hex"),
			bytes: fixture.bytes.length,
			ffprobe: {
				streams: fixture.probe.streams,
				firstPacket: Math.min(...packetTimes),
				lastPacket: Math.max(...packetTimes),
				maxPacketGap: Math.max(
					...packetTimes
						.slice(1)
						.map((time, index) => time - packetTimes[index]),
				),
			},
			observed,
		});
		console.log(`PASS ${fixture.name}`);
	}
	const evidence = {
		recordedAt: new Date().toISOString(),
		mediabunny: version,
		browser: await browser.version(),
		results,
		limitations: [
			"Synthetic Chromium decoder and adapter evidence; no physical playback or Firefox/Safari claims.",
			"Video strip asserts nonempty extraction at requested timestamps; exact decoded packet timestamps are asserted through production scrub.",
			"Audio buffer decoder is the production generated-mix source decoder; final muxed export is covered separately.",
			"Audio fixtures include encoder priming/negative packet starts where generated by ffmpeg; all user ranges remain nonnegative.",
		],
	};
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
	console.log(`Evidence: ${output}`);
} finally {
	await browser.close();
}
