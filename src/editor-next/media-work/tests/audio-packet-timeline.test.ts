import { describe, expect, it } from "vitest";

import {
	AudioPacketTimeline,
	audioPacketDurationsMaySpanGaps,
} from "../adapters/audio-packet-timeline";

describe("AudioPacketTimeline", () => {
	it("splits a compressed-audio packet whose inferred duration spans a gap", () => {
		const timeline = createTimeline(true, [
			[0, 0.02],
			[0.02, 0.02],
			[0.04, 1.02],
			[1.06, 0.02],
		]);

		expect(timeline.gaps()).toEqual([{ endSeconds: 1.06, startSeconds: 0.06 }]);
	});

	it("finds the gap from a gap-spanning packet and the one after it", () => {
		const timeline = createTimeline(true, [
			[2.014, 1.022],
			[3.036, 0.02],
		]);

		expect(timeline.gaps()).toEqual([
			{ endSeconds: 3.036, startSeconds: expect.closeTo(2.034, 9) },
		]);
	});

	it("keeps Vorbis-style long and short blocks contiguous", () => {
		const long = 2048 / 44_100;
		const short = 256 / 44_100;
		const transition = 1152 / 44_100;
		const durations = [long, long, transition, short, short, transition, long];
		let startSeconds = 0;
		const timeline = createTimeline(
			true,
			durations.map((duration) => {
				const range: [number, number] = [startSeconds, duration];
				startSeconds += duration;
				return range;
			}),
		);

		expect(timeline.gaps()).toEqual([]);
	});

	it.each([
		{ expected: 0.04, label: "inside the gap", preRoll: 0, start: 0.5 },
		{
			expected: 0.04,
			label: "after it within pre-roll",
			preRoll: 0.4,
			start: 1.2,
		},
		{
			expected: 1.5,
			label: "after it beyond pre-roll",
			preRoll: 0.4,
			start: 1.5,
		},
		{ expected: 0.03, label: "before it", preRoll: 0.4, start: 0.03 },
	])(
		"starts decoding before a gap the pre-roll would cross when starting $label",
		({ expected, preRoll, start }) => {
			const timeline = createTimeline(true, [
				[0, 0.02],
				[0.02, 0.02],
				[0.04, 1.02],
				[1.06, 0.02],
				[1.08, 0.02],
			]);

			expect(timeline.decodeStartFor(start, preRoll)).toBe(expected);
		},
	);

	it("leaves only PCM codecs and unknown codecs at their declared durations", () => {
		expect(audioPacketDurationsMaySpanGaps("aac")).toBe(true);
		expect(audioPacketDurationsMaySpanGaps("opus")).toBe(true);
		expect(audioPacketDurationsMaySpanGaps("pcm-s16")).toBe(false);
		expect(audioPacketDurationsMaySpanGaps("ulaw")).toBe(false);
		expect(audioPacketDurationsMaySpanGaps(null)).toBe(false);
	});

	it("trusts declared durations for PCM-style packets", () => {
		const timeline = createTimeline(false, [
			[0, 0.02],
			[0.02, 1.02],
			[1.04, 0.02],
		]);

		expect(timeline.gaps()).toEqual([]);
		expect(timeline.presentedRanges()).toEqual(timeline.declaredRanges());
	});
});

function createTimeline(
	packetDurationsMaySpanGaps: boolean,
	packets: Array<[startSeconds: number, durationSeconds: number]>,
) {
	const timeline = new AudioPacketTimeline({
		packetDurationsMaySpanGaps,
		sampleRate: 48_000,
	});
	for (const [startSeconds, durationSeconds] of packets) {
		timeline.add({ endSeconds: startSeconds + durationSeconds, startSeconds });
	}
	timeline.sort();
	return timeline;
}
