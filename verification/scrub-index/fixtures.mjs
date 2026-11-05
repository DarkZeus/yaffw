import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const directory = resolve("tmp/scrub-index");

/** Generate real codec/container fixtures and independent ffprobe packet truth. */
export function generateFixtures() {
	mkdirSync(directory, { recursive: true });
	const fixtures = [];
	for (const [name, duration, gopSeconds] of [
		["long-gop.mp4", 600, 10],
		["short-long-gop.mp4", 61, 20],
	]) {
		ffmpeg([
			"-f",
			"lavfi",
			"-i",
			`testsrc2=size=160x90:rate=10:duration=${duration}`,
			"-an",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-threads",
			"1",
			"-g",
			String(gopSeconds * 10),
			"-keyint_min",
			String(gopSeconds * 10),
			"-sc_threshold",
			"0",
			"-bf",
			"2",
			"-flags",
			"+bitexact",
			"-fflags",
			"+bitexact",
			"-movflags",
			"+faststart",
			resolve(directory, name),
		]);
		fixtures.push({ name, duration, gopSeconds, frameRate: 10 });
	}
	const normalPath = resolve(directory, "sparse-cues.mkv");
	ffmpeg([
		"-i",
		resolve(directory, "long-gop.mp4"),
		"-map",
		"0:v:0",
		"-c",
		"copy",
		"-cluster_time_limit",
		"500",
		"-write_crc32",
		"0",
		"-avoid_negative_ts",
		"disabled",
		"-fflags",
		"+bitexact",
		normalPath,
	]);
	const normal = readFileSync(normalPath);
	const segment = elements(normal, 0, normal.length).find(
		(element) => element.id === 0x18538067,
	);
	assert.ok(segment, "MKV has a Segment");
	const segmentElements = elements(normal, segment.start, segment.end);
	const cues = segmentElements.find((element) => element.id === 0x1c53bb6b);
	assert.ok(cues, "MKV has Cues");
	const points = elements(normal, cues.start, cues.end).filter(
		(element) => element.id === 0xbb,
	);
	assert.equal(points.length, 60, "One CuePoint per 10-second GOP");
	const clusters = segmentElements.filter(
		(element) => element.id === 0x1f43b675,
	);
	assert.ok(
		clusters.length > 900,
		"500ms cluster limit creates many uncued clusters",
	);
	const sparse = Buffer.from(normal);
	// CuePoint and Void IDs both occupy one byte. Only replacing the ID leaves
	// every element size, cluster offset, and SeekHead position unchanged.
	for (const point of points.slice(1)) sparse[point.offset] = 0xec;
	assert.equal(
		elements(sparse, cues.start, cues.end).filter(
			(element) => element.id === 0xbb,
		).length,
		1,
	);
	writeFileSync(resolve(directory, "first-cue-only.mkv"), sparse);
	for (const [name, cuePoints] of [
		["sparse-cues.mkv", points.length],
		["first-cue-only.mkv", 1],
	]) {
		fixtures.push({
			name,
			duration: 600,
			gopSeconds: 10,
			frameRate: 10,
			cuePoints,
			originalCuePoints: points.length,
			clusterCount: clusters.length,
			clusterTimeLimitMs: 500,
		});
	}
	return fixtures.map((fixture) => {
		const path = resolve(directory, fixture.name);
		const probe = JSON.parse(
			execFileSync(
				"ffprobe",
				[
					"-v",
					"error",
					"-show_packets",
					"-show_streams",
					"-show_format",
					"-of",
					"json",
					path,
				],
				{ maxBuffer: 20_000_000 },
			).toString(),
		);
		assert.equal(probe.streams.length, 1, "Scrub fixtures contain only video");
		assert.equal(probe.streams[0].codec_name, "h264");
		assert.ok(
			probe.streams[0].has_b_frames > 0,
			"Fixture exercises frame reordering",
		);
		assert.equal(probe.packets.length, fixture.duration * fixture.frameRate);
		return {
			...fixture,
			kind: "video",
			path,
			bytes: readFileSync(path),
			probe,
		};
	});
}

function ffmpeg(args) {
	execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

function elements(bytes, start, end) {
	const result = [];
	for (let offset = start; offset < end; ) {
		const id = vint(bytes, offset, true);
		const size = vint(bytes, offset + id.length, false);
		const payload = offset + id.length + size.length;
		const next = Math.min(end, payload + size.value);
		assert.ok(
			next > offset && next <= bytes.length,
			"Valid EBML element bounds",
		);
		result.push({ id: id.value, offset, start: payload, end: next });
		offset = next;
	}
	return result;
}

function vint(bytes, offset, preserveMarker) {
	let length = 1;
	while (length <= 8 && !(bytes[offset] & (1 << (8 - length)))) length++;
	assert.ok(
		length <= 8 && offset + length <= bytes.length,
		"Valid EBML variable integer",
	);
	let value = preserveMarker
		? bytes[offset]
		: bytes[offset] & ((1 << (8 - length)) - 1);
	for (let index = 1; index < length; index++)
		value = value * 256 + bytes[offset + index];
	return { length, value };
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	console.log(
		JSON.stringify(
			generateFixtures().map(({ bytes, probe, ...fixture }) => ({
				...fixture,
				byteLength: bytes.length,
				packetCount: probe.packets.length,
				keyPacketCount: probe.packets.filter((packet) =>
					packet.flags.includes("K"),
				).length,
				firstPresentationTimestamp: Number(probe.packets[0].pts_time),
			})),
			null,
			2,
		),
	);
}
