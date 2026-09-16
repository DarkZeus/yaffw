import { describe, expect, it } from "vitest";
import {
	type Asset,
	FRAME,
	SECOND,
	type Sequence,
	end,
	initialSequence,
	makeClip,
	makeTrack,
	moveClips,
	placeClips,
	removeClips,
	resizeClips,
	selection,
	splitClips,
} from "./model";
const assets: Asset[] = [
	{
		id: "zone",
		name: "Zone",
		kind: "video",
		duration: 13.5 * SECOND,
		url: "",
		poster: "",
	},
	{
		id: "encounter",
		name: "Encounter",
		kind: "video",
		duration: 7 * SECOND,
		url: "",
		poster: "",
	},
];
const pair = ["wide", "wide-audio"];
function simple(): Sequence {
	return {
		name: "Test sequence",
		tracks: [
			makeTrack("v1", "Picture", "video"),
			makeTrack("a1", "Sync", "audio"),
		],
		clips: [
			makeClip("long", "zone", "Long", "video", "v1", 0, 10 * SECOND),
			makeClip("tail", "zone", "Tail", "video", "v1", 10 * SECOND, 3 * SECOND),
		],
		markers: [],
	};
}
describe("NLE sequence operations", () => {
	it("expands linked selection and leaves independent audio separate", () => {
		expect(selection(initialSequence, ["wide"], true).map((c) => c.id)).toEqual(
			pair,
		);
		expect(
			selection(initialSequence, ["wide"], false).map((c) => c.id),
		).toEqual(["wide"]);
		expect(
			selection(initialSequence, ["score"], true).map((c) => c.id),
		).toEqual(["score"]);
	});
	it("moves a selected A/V pair without changing their sync offset", () => {
		const result = moveClips(initialSequence, pair, 26 * SECOND);
		expect(result.clips.find((c) => c.id === "wide")?.start).toBe(26 * SECOND);
		expect(result.clips.find((c) => c.id === "wide-audio")?.start).toBe(
			26 * SECOND,
		);
	});
	it("rejects a move when any linked destination is occupied", () => {
		expect(moveClips(initialSequence, pair, SECOND)).toBe(initialSequence);
	});
	it("uses the audio clip as the lead for audio-originated track moves", () => {
		const result = moveClips(initialSequence, ["wide-audio", "wide"], 0, "a3");
		expect(result.clips.find((c) => c.id === "wide-audio")?.trackId).toBe("a3");
		expect(result.clips.find((c) => c.id === "wide")?.trackId).toBe("v1");
	});
	it("rejects audio on video tracks", () => {
		expect(moveClips(initialSequence, ["score"], 0, "v3")).toBe(
			initialSequence,
		);
	});
	it("respects a locked linked track", () => {
		const state = {
			...initialSequence,
			tracks: initialSequence.tracks.map((t) =>
				t.id === "a1" ? { ...t, locked: true } : t,
			),
		};
		expect(moveClips(state, pair, 26 * SECOND)).toBe(state);
		expect(removeClips(state, pair, false)).toBe(state);
	});
	it("splits linked A/V at the same media offset with a new right-hand link group", () => {
		const result = splitClips(initialSequence, pair, 3 * SECOND);
		const right = result.clips.filter((c) => c.start === 3 * SECOND);
		expect(right).toHaveLength(2);
		expect(right[0].linkId).toBe(right[1].linkId);
		expect(
			right.every(
				(c) => c.sourceIn === 3 * SECOND && c.duration === 3 * SECOND,
			),
		).toBe(true);
	});
	it.each(["insert", "overwrite"] as const)(
		"keeps each side of an A/V %s edit in its own link group",
		(mode) => {
			const additions = [
				makeClip("new-v", "zone", "New", "video", "v1", 2 * SECOND, SECOND),
				makeClip(
					"new-a",
					"zone",
					"New audio",
					"audio",
					"a1",
					2 * SECOND,
					SECOND,
				),
			];
			const result = placeClips(initialSequence, additions, mode);
			const right = result.clips.filter((c) => c.start === 3 * SECOND);
			expect(right).toHaveLength(2);
			expect(right[0].linkId).toBe(right[1].linkId);
			expect(right[0].linkId).not.toBe(
				initialSequence.clips.find((c) => c.id === "wide")?.linkId,
			);
			expect(selection(result, [right[0].id], true)).toHaveLength(2);
		},
	);
	it("inserts inside a clip by splitting it and shifting following media", () => {
		const add = makeClip(
			"new",
			"zone",
			"New",
			"video",
			"v1",
			4 * SECOND,
			2 * SECOND,
		);
		const result = placeClips(simple(), [add], "insert");
		expect(result.clips.find((c) => c.id === "long")?.duration).toBe(
			4 * SECOND,
		);
		expect(result.clips.find((c) => c.id === "tail")?.start).toBe(12 * SECOND);
		expect(
			result.clips.some(
				(c) =>
					c.start === 6 * SECOND &&
					c.sourceIn === 4 * SECOND &&
					c.duration === 6 * SECOND,
			),
		).toBe(true);
	});
	it("overwrites only the covered interval and preserves both source remainders", () => {
		const add = makeClip(
			"new",
			"zone",
			"New",
			"video",
			"v1",
			4 * SECOND,
			2 * SECOND,
		);
		const result = placeClips(simple(), [add], "overwrite");
		expect(result.clips.find((c) => c.id === "long")?.duration).toBe(
			4 * SECOND,
		);
		expect(result.clips.find((c) => c.id === "tail")?.start).toBe(10 * SECOND);
		expect(
			result.clips.some(
				(c) =>
					c.start === 6 * SECOND &&
					c.sourceIn === 6 * SECOND &&
					c.duration === 4 * SECOND,
			),
		).toBe(true);
	});
	it("ripple deletes on affected tracks while preserving independent music timing", () => {
		const result = removeClips(initialSequence, pair, true);
		expect(result.clips.find((c) => c.id === "action")?.start).toBe(0);
		expect(result.clips.find((c) => c.id === "action-audio")?.start).toBe(0);
		expect(result.clips.find((c) => c.id === "score")?.duration).toBe(
			25 * SECOND,
		);
	});
	it("preserves gaps on a normal delete", () => {
		const result = removeClips(initialSequence, pair, false);
		expect(result.clips.find((c) => c.id === "action")?.start).toBe(6 * SECOND);
	});
	it("resizes linked clips together and enforces minimum frame length", () => {
		const result = resizeClips(
			initialSequence,
			pair,
			"wide",
			"out",
			-99 * SECOND,
			assets,
		);
		expect(result.clips.find((c) => c.id === "wide")?.duration).toBe(FRAME);
		expect(result.clips.find((c) => c.id === "wide-audio")?.duration).toBe(
			FRAME,
		);
	});
	it("does not extend an edge past the source or the next clip", () => {
		const result = resizeClips(
			initialSequence,
			pair,
			"wide",
			"out",
			99 * SECOND,
			assets,
		);
		expect(result.clips.find((c) => c.id === "wide")?.duration).toBe(
			6 * SECOND,
		);
	});
	it("keeps source endpoints stable when the left edge moves", () => {
		const result = resizeClips(
			initialSequence,
			pair,
			"wide",
			"in",
			SECOND,
			assets,
		);
		const c = result.clips.find((c) => c.id === "wide");
		expect(c).toMatchObject({
			start: SECOND,
			sourceIn: SECOND,
			duration: 5 * SECOND,
		});
		expect(c && end(c)).toBe(6 * SECOND);
	});
});
