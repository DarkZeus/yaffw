import assert from "node:assert/strict";

export function elements(bytes, start, end) {
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
