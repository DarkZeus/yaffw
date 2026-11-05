import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

function packets(file) {
	return JSON.parse(
		execFileSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-show_packets",
				"-show_data_hash",
				"sha256",
				"-show_entries",
				"packet=codec_type,pts_time,dts_time,duration_time,size,data_hash",
				"-of",
				"json",
				file,
			],
			{ maxBuffer: 8 * 1024 * 1024 },
		),
	).packets;
}

function boxes(file) {
	const data = readFileSync(file);
	const result = [];
	for (let offset = 0; offset < data.length; ) {
		let size = data.readUInt32BE(offset);
		if (size === 1) size = Number(data.readBigUInt64BE(offset + 8));
		if (size === 0) size = data.length - offset;
		assert.ok(size >= 8 && offset + size <= data.length);
		result.push({
			type: data.toString("ascii", offset + 4, offset + 8),
			offset,
			size,
		});
		offset += size;
	}
	return result;
}

const evidence = JSON.parse(
	readFileSync("tmp/file-backed-export/evidence.json", "utf8"),
);
for (const result of evidence.results) {
	assert.ok(result.samples.some((s) => s.phase === "export"));
	assert.ok(result.samples.every((s) => Number.isFinite(s.backingStorageSize)));
}
const artifacts = [];
for (const repetition of [
	...new Set(evidence.results.map((r) => r.repetition)),
]) {
	const baseline = packets(`tmp/file-backed-export/buffer-${repetition}.mp4`);
	const candidate = packets(`tmp/file-backed-export/file-${repetition}.mp4`);
	// Interleaving may differ; compare each complete encoded track independently.
	for (const kind of ["video", "audio"])
		assert.deepEqual(
			candidate.filter((p) => p.codec_type === kind),
			baseline.filter((p) => p.codec_type === kind),
		);
	const observed = evidence.results.find(
		(r) => r.candidate && r.repetition === repetition,
	);
	const layout = boxes(`tmp/file-backed-export/file-${repetition}.mp4`);
	assert.ok(
		layout.find((b) => b.type === "moov").offset <
			layout.find((b) => b.type === "mdat").offset,
	);
	const counts = Object.fromEntries(
		["video", "audio"].map((kind) => [
			kind,
			candidate.filter((p) => p.codec_type === kind).length,
		]),
	);
	for (const track of observed.budgets.reservation)
		assert.ok(track.maximumPacketCount >= counts[track.type]);
	artifacts.push({
		repetition,
		counts,
		layout,
		identicalEncodedTrackPackets: true,
		packetEvidenceSha256: createHash("sha256")
			.update(JSON.stringify(candidate))
			.digest("hex"),
	});
}
const summary = {
	browser: evidence.browser,
	recordedAt: evidence.recordedAt,
	mediabunny: "1.65.2",
	sourceSha256: evidence.sourceSha256,
	selection: { startUs: 1_137_000, endUs: 13_283_000 },
	artifacts,
	results: evidence.results.map(({ samples, ...result }) => ({
		...result,
		sampleCount: samples.length,
		sampledPeakBackingBytes: Math.max(
			...samples.map((s) => s.backingStorageSize),
		),
		sampledExportPeakBackingBytes: Math.max(
			...samples
				.filter((s) => s.phase === "export")
				.map((s) => s.backingStorageSize),
		),
		sampledPeakJsHeapBytes: Math.max(...samples.map((s) => s.usedSize)),
	})),
};
writeFileSync(
	"tmp/file-backed-export/summary.json",
	JSON.stringify(summary, null, 2),
);
console.log(
	"PASS packet parity, both track reservations, reserved moov before mdat",
);
