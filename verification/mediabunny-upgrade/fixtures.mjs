import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { elements } from "../ebml.mjs";

export const directory = resolve("tmp/mediabunny-upgrade");
export function generateFixtures() {
	mkdirSync(directory, { recursive: true });
	const run = (args) =>
		execFileSync("ffmpeg", [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			...args,
		]);
	run([
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=160x90:rate=10:duration=61",
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-g",
		"200",
		"-keyint_min",
		"200",
		"-sc_threshold",
		"0",
		"-bf",
		"2",
		resolve(directory, "long-gop.mp4"),
	]);
	const fixtures = [{ name: "long-gop.mp4", kind: "video" }];
	run([
		"-i",
		resolve(directory, "long-gop.mp4"),
		"-c",
		"copy",
		"-write_crc32",
		"0",
		resolve(directory, "sparse-cues.mkv"),
	]);
	const sparsePath = resolve(directory, "sparse-cues.mkv");
	const sparse = readFileSync(sparsePath);
	const segment = elements(sparse, 0, sparse.length).find(
		(element) => element.id === 0x18538067,
	);
	assert.ok(segment);
	const cues = elements(sparse, segment.start, segment.end).find(
		(element) => element.id === 0x1c53bb6b,
	);
	assert.ok(cues);
	const points = elements(sparse, cues.start, cues.end).filter(
		(element) => element.id === 0xbb,
	);
	assert.equal(
		points.length,
		4,
		"Original MKV has one CuePoint per 20-second GOP",
	);
	// Replace later CuePoints with equal-length EBML Void elements. Segment,
	// cluster, SeekHead and first CuePoint byte offsets remain exactly unchanged.
	for (const point of points.slice(1)) sparse[point.offset] = 0xec;
	assert.equal(
		elements(sparse, cues.start, cues.end).filter(
			(element) => element.id === 0xbb,
		).length,
		1,
	);
	writeFileSync(sparsePath, sparse);
	fixtures.push({
		name: "sparse-cues.mkv",
		kind: "video",
		cuePoints: 1,
		originalCuePoints: points.length,
	});
	run([
		"-i",
		"public/export-correctness-fixtures/sync-flash-click-two-audio.mp4",
		"-map",
		"0",
		"-c",
		"copy",
		resolve(directory, "sync-two-audio.mkv"),
	]);
	fixtures.push({ name: "sync-two-audio.mkv", kind: "sync" });
	for (const [codec, extension] of [
		["libopus", "webm"],
		["aac", "mkv"],
		["libvorbis", "webm"],
		["aac", "mp4"],
	]) {
		for (const gap of [false, true]) {
			const name = `${codec}-${gap ? "gap" : "continuous"}.${extension}`;
			run([
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:sample_rate=48000:duration=5",
				...(gap ? ["-af", "aselect='not(between(t,2,3))'"] : []),
				"-c:a",
				codec,
				resolve(directory, name),
			]);
			fixtures.push({ name, kind: "audio", gap });
		}
	}
	return fixtures.map((fixture) => ({
		...fixture,
		bytes: readFileSync(resolve(directory, fixture.name)),
		probe: JSON.parse(
			execFileSync(
				"ffprobe",
				[
					"-v",
					"error",
					"-show_packets",
					"-show_streams",
					"-of",
					"json",
					resolve(directory, fixture.name),
				],
				{ maxBuffer: 10_000_000 },
			).toString(),
		),
	}));
}
