import assert from "node:assert/strict";
import { test } from "vitest";
import {
	detectAudioEvents,
	detectVideoEvents,
	validateSignals,
} from "../fixture-validation.mjs";

test("detects sample crossings without consulting nominal event metadata", () => {
	const samples = new Float32Array(1000);
	samples[123] = 0.01;
	samples[130] = -0.01;
	samples[632] = -0.01;
	assert.deepEqual(detectAudioEvents(samples, 1000), [0.123, 0.632]);
});

test("flash onset follows decoded pixels and frame timestamps", () => {
	assert.deepEqual(
		detectVideoEvents([0, 255, 255, 0, 255], [0, 0.03, 0.06, 0.09, 0.12]),
		[0.03, 0.12],
	);
});

test("rejects shifted audio even when event counts and spacing match", () => {
	const visual = Array.from({ length: 9 }, (_, index) => index + 1);
	assert.throws(
		() =>
			validateSignals(
				visual,
				visual.map((time) => time + 0.02),
			),
		/align within 1 ms/,
	);
	assert.throws(
		() => validateSignals(visual, visual.slice(1)),
		/nine decoded clicks/,
	);
});
