import assert from "node:assert/strict";
import { test } from "vitest";
import { elements } from "../ebml.mjs";

test("preserves byte positions when later CuePoints become equal-length Void elements", () => {
	const bytes = Buffer.from([0xbb, 0x82, 0x80, 0x80, 0xbb, 0x81, 0x80]);
	const before = elements(bytes, 0, bytes.length);
	bytes[before[1].offset] = 0xec;
	const after = elements(bytes, 0, bytes.length);
	assert.deepEqual(
		after.map(({ offset, start, end }) => ({ offset, start, end })),
		[
			{ offset: 0, start: 2, end: 4 },
			{ offset: 4, start: 6, end: 7 },
		],
	);
	assert.deepEqual(
		after.map(({ id }) => id),
		[0xbb, 0xec],
	);
});

test("rejects a truncated variable-length size instead of reading beyond the fixture", () => {
	assert.throws(
		() => elements(Buffer.from([0xbb, 0x40]), 0, 2),
		/Valid EBML variable integer/,
	);
});
