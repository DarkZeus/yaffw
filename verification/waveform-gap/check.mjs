import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prepareFixtures } from "./fixtures.mjs";

import { launchBrowser } from "../browser.cjs";
const fixtures = prepareFixtures();
const browser = await launchBrowser();
const output = resolve(process.argv[2] || "tmp/waveform-gap/evidence.json");
const results = [];
try {
	const page = await browser.newPage();
	await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
	for (const fixture of fixtures) {
		const observed = await page.evaluate(
			async ({ base64, sync }) => {
				const harness = await import(
					"/verification/waveform-gap/browser-check.ts"
				);
				return harness.checkWaveform(base64, sync);
			},
			{
				base64: fixture.bytes.toString("base64"),
				sync: fixture.kind === "sync",
			},
		);
		const failures = [];
		for (const time of fixture.kind === "sync"
			? []
			: [0.1, 1.5, 2.5, 3.5, 4.5]) {
			const peak = observed.bins.find((bin) => bin.time === time).peak;
			const silent =
				(fixture.gap && time === 2.5) ||
				(fixture.leadingOffset && time === 0.1);
			if (!(silent ? peak < 0.01 : peak > 0.1))
				failures.push(
					`waveform ${time}s: ${peak}, expected ${silent ? "silence" : "tone"}`,
				);
		}
		if (fixture.kind === "sync") {
			for (const [index, onset] of observed.onsets.entries())
				assert.ok(
					Math.abs(onset - (index + 1.021)) < 0.015,
					`waveform click ${index}: ${onset}`,
				);
			assert.equal(observed.onsets.length, 9);
			for (const result of observed.reference.results)
				for (const key of ["previewOnsets", "mixOnsets"]) {
					const expected = Array.from(
						{ length: 9 },
						(_, index) => index + 1.021,
					).filter((time) => time > result.start);
					assert.equal(result[key].length, expected.length);
					for (const [index, time] of result[key].entries())
						assert.ok(Math.abs(time - expected[index]) < 0.015);
				}
		}
		assert.equal(observed.count, 8192);
		assert.equal(observed.cacheSame, true);
		assert.equal(observed.abortName, "AbortError");
		assert.equal(observed.unavailable, "unavailable");
		assert.deepEqual(
			observed.workers.map((worker) => [worker.messages, worker.terminated]),
			[
				[1, 1],
				[0, 1],
				[1, 1],
			],
		);
		assert.equal(observed.workers[0].bytes, 8192 * 4);
		for (const result of observed.reference?.results ?? [])
			for (const probe of fixture.kind === "sync" ? [] : result.probes)
				for (const path of ["mixRms", "previewRms"]) {
					const silent =
						(fixture.gap && probe.time === 2.5) ||
						(fixture.leadingOffset && probe.time === 0.05);
					assert.ok(silent ? probe[path] < 0.001 : probe[path] > 0.03);
				}
		const packetTimes = fixture.probe.packets.map((packet) =>
			Number(packet.pts_time),
		);
		results.push({
			name: fixture.name,
			gap: fixture.gap,
			sha256: createHash("sha256").update(fixture.bytes).digest("hex"),
			firstPacket: packetTimes[0],
			maxPacketGap: Math.max(
				...packetTimes.slice(1).map((time, index) => time - packetTimes[index]),
			),
			failures,
			observed,
		});
		console.log(
			`${failures.length ? "FAIL" : "PASS"} ${fixture.name}: ${failures.join("; ")}`,
		);
	}
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(
		output,
		`${JSON.stringify({ recordedAt: new Date().toISOString(), browser: await browser.version(), results }, null, 2)}\n`,
	);
	if (results.some((result) => result.failures.length)) process.exitCode = 1;
} finally {
	await browser.close();
}
