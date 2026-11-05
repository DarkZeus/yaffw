import assert from "node:assert/strict";
import { test } from "vitest";
import {
	analyzePresentedFrames,
	decodeIdentity,
	detectClicks,
	detectFlashes,
	measurePresentedBoundaryEvidence,
} from "../artifact.mjs";

test("source intervals include the real VFR gap, with an exclusive final end", () => {
	const source = analyzePresentedFrames([
		{ id: 120, pts: 2, duration: 1 / 60 },
		{ id: 122, pts: 122 / 60, duration: 1 / 60 },
		{ id: 123, pts: 123 / 60, duration: 1 / 60 },
	]);
	assert.ok(Math.abs(source.frames[0].duration - 2 / 60) < 1e-12);
	assert.equal(source.frames[0].end, 122 / 60);
	assert.ok(Math.abs(source.end - 124 / 60) < 1e-12);
	const output = analyzePresentedFrames(
		[
			{ id: 120, pts: 0, duration: 1 / 60 },
			{ id: 122, pts: 2 / 60, duration: 1 / 60 },
		],
		source.frames,
	);
	assert.equal(output.sourceStart, 2);
	assert.equal(output.sourceEnd, 123 / 60);
	assert.ok(Math.abs(output.end - 3 / 60) < 1e-12);
});

test("identity mapping rejects an output frame absent from the source", () => {
	assert.throws(
		() =>
			analyzePresentedFrames(
				[{ id: 7, pts: 0, duration: 1 }],
				[{ id: 8, pts: 0, end: 1 }],
			),
		/Unknown source frame identity 7/,
	);
});

test("invalid and unordered timestamps cannot yield a successful measurement", () => {
	assert.throws(() => analyzePresentedFrames([]), /No presented/);
	assert.throws(
		() => analyzePresentedFrames([{ id: 0, pts: null, duration: 1 }]),
		/no presentation timestamp/,
	);
	assert.throws(
		() =>
			analyzePresentedFrames([
				{ id: 0, pts: 1, duration: 1 },
				{ id: 1, pts: 0, duration: 1 },
			]),
		/Invalid presentation interval/,
	);
	assert.throws(
		() => analyzePresentedFrames([{ id: 0, pts: 0, duration: 0 }]),
		/Invalid presentation interval/,
	);
});

test("luminance barcode recovers original tick identity after moderate compression noise", () => {
	const pixels = Buffer.alloc(160 * 96, 72);
	const identity = 0b101001010111;
	for (let bit = 0; bit < 12; bit++) {
		for (let y = 4; y < 12; y++) {
			for (let x = 4 + 8 * bit; x < 12 + 8 * bit; x++)
				pixels[y * 160 + x] = identity & (1 << bit) ? 211 : 35;
		}
	}
	assert.equal(decodeIdentity(pixels), identity);
	pixels.fill(124);
	assert.throws(() => decodeIdentity(pixels), /Ambiguous identity/);
});

test("PCM click onsets retain offsets and collapse ringing into one event", () => {
	const samples = new Float32Array(2000);
	for (const onset of [100, 1100]) {
		for (let index = onset; index < onset + 20; index++)
			samples[index] = index % 2 ? -0.5 : 0.5;
	}
	assert.deepEqual(detectClicks(samples, 1000, 0.25), [
		{ pts: 0.35, sample: 100 },
		{ pts: 1.35, sample: 1100 },
	]);
	assert.deepEqual(detectClicks(new Float32Array(100), 1000), []);
});

test("100ms audio bursts are one onset even with brief ringing gaps", () => {
	const samples = new Float32Array(2200);
	for (const onset of [100, 1100])
		for (let index = onset; index < onset + 100; index++)
			samples[index] = index % 13 < 3 ? 0 : 0.5;
	assert.equal(detectClicks(samples, 1000).length, 2);
});

test("unknown final sample end stays unavailable instead of guessing a frame rate", () => {
	const result = analyzePresentedFrames([{ id: 1, pts: 0, duration: null }]);
	assert.equal(result.end, null);
});

test("flashes use decoded visible transitions and their actual presentation times", () => {
	assert.deepEqual(
		detectFlashes([
			{ id: 1, pts: 0, flash: false },
			{ id: 2, pts: 0.03, sourcePts: 1, flash: true },
			{ id: 3, pts: 0.05, sourcePts: 1.02, flash: true },
			{ id: 4, pts: 0.08, flash: false },
			{ id: 5, pts: 1.03, sourcePts: 2, flash: true },
		]),
		[
			{ id: 2, pts: 0.03, sourcePts: 1 },
			{ id: 5, pts: 1.03, sourcePts: 2 },
		],
	);
});

test("boundary evidence uses final output interval instead of full VFR source coverage", () => {
	const source = analyzePresentedFrames([
		{ id: 438, pts: 7.3, duration: 2 / 60 },
	]);
	const presented = analyzePresentedFrames(
		[{ id: 438, pts: 0, duration: 1 / 60 }],
		source.frames,
	);
	assert.ok(Math.abs(presented.sourceEnd - (7.3 + 2 / 60)) < 1e-12);
	assert.ok(Math.abs(presented.mappedSourceEnd - (7.3 + 1 / 60)) < 1e-12);
	assert.deepEqual(
		measurePresentedBoundaryEvidence(presented, { start: 7.3, end: 7.31 }),
		{
			kind: "start-and-end",
			startDeltaUs: 0,
			endDeltaUs: 6667,
		},
	);
});

test("unknown final output duration never produces boundary proof even with known source coverage", () => {
	const presented = analyzePresentedFrames(
		[{ id: 1, pts: 0, duration: null }],
		[{ id: 1, pts: 1, end: 2 }],
	);
	assert.equal(presented.sourceEnd, 2);
	assert.equal(presented.mappedSourceEnd, null);
	assert.deepEqual(
		measurePresentedBoundaryEvidence(presented, { start: 1, end: 2 }),
		{ kind: "none" },
	);
});
