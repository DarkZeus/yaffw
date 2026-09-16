export const SECOND = 1_000_000;
export const FRAME = Math.round(SECOND / 30);
export type Kind = "video" | "audio" | "image" | "title";
export type Asset = {
	id: string;
	name: string;
	kind: Kind;
	url: string;
	poster: string;
	duration: number;
	peaks?: number[];
	hasAudio?: boolean;
};
export type Track = {
	id: string;
	name: string;
	kind: "video" | "audio";
	muted: boolean;
	solo: boolean;
	locked: boolean;
	hidden: boolean;
	gain: number;
};
export type Clip = {
	id: string;
	assetId: string;
	name: string;
	kind: Kind;
	trackId: string;
	start: number;
	sourceIn: number;
	duration: number;
	linkId?: string;
	x: number;
	y: number;
	scale: number;
	opacity: number;
	gain: number;
	fadeIn: number;
	fadeOut: number;
	text: string;
	color: string;
};
export type Marker = { id: string; at: number; name: string };
export type Sequence = {
	name: string;
	clips: Clip[];
	tracks: Track[];
	markers: Marker[];
};
export function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v));
}
export function frame(v: number) {
	return Math.round((Math.round((v / SECOND) * 30) * SECOND) / 30);
}
export function end(c: Clip) {
	return c.start + c.duration;
}
export function duration(clips: Clip[]) {
	return Math.max(0, ...clips.map(end));
}
export function time(v: number) {
	const n = Math.max(0, Math.round((v / SECOND) * 30));
	return `${Math.floor(n / 1800)
		.toString()
		.padStart(2, "0")}:${Math.floor((n / 30) % 60)
		.toString()
		.padStart(2, "0")}:${(n % 30).toString().padStart(2, "0")}`;
}
export function makeTrack(
	id: string,
	name: string,
	kind: Track["kind"],
): Track {
	return {
		id,
		name,
		kind,
		muted: false,
		solo: false,
		locked: false,
		hidden: false,
		gain: 1,
	};
}
export function makeClip(
	id: string,
	assetId: string,
	name: string,
	kind: Kind,
	trackId: string,
	start: number,
	length: number,
	extra: Partial<Clip> = {},
): Clip {
	return {
		id,
		assetId,
		name,
		kind,
		trackId,
		start,
		duration: length,
		sourceIn: 0,
		x: 0,
		y: 0,
		scale: 1,
		opacity: 1,
		gain: 1,
		fadeIn: 0,
		fadeOut: 0,
		text: "",
		color: "oklch(0.970151 0 none)",
		...extra,
	};
}
export const initialSequence: Sequence = {
	name: "Sequence 01",
	tracks: [
		makeTrack("v3", "Titles", "video"),
		makeTrack("v2", "Inserts", "video"),
		makeTrack("v1", "Main picture", "video"),
		makeTrack("a1", "Production", "audio"),
		makeTrack("a2", "Score", "audio"),
		makeTrack("a3", "Atmosphere", "audio"),
	],
	clips: [
		makeClip("wide", "zone", "Marsh · wide", "video", "v1", 0, 6 * SECOND, {
			linkId: "wide-pair",
		}),
		makeClip(
			"action",
			"encounter",
			"Close encounter",
			"video",
			"v1",
			6 * SECOND,
			7 * SECOND,
			{ linkId: "action-pair" },
		),
		makeClip(
			"return",
			"zone",
			"Back into the Zone",
			"video",
			"v1",
			13 * SECOND,
			7 * SECOND,
			{ sourceIn: 5 * SECOND, linkId: "return-pair" },
		),
		makeClip(
			"ending",
			"detail",
			"Creature detail",
			"video",
			"v1",
			20 * SECOND,
			5 * SECOND,
			{ linkId: "ending-pair" },
		),
		makeClip(
			"detail-insert",
			"detail",
			"Creature · inset",
			"video",
			"v2",
			7 * SECOND,
			4 * SECOND,
			{ x: 29, y: 24, scale: 0.32, fadeIn: SECOND / 2, fadeOut: SECOND / 2 },
		),
		makeClip(
			"opening-title",
			"title",
			"Into the Zone",
			"title",
			"v3",
			SECOND,
			4 * SECOND,
			{
				text: "INTO THE ZONE",
				x: 0,
				y: 26,
				scale: 1,
				fadeIn: SECOND / 2,
				fadeOut: SECOND / 2,
			},
		),
		makeClip(
			"chapter-title",
			"title",
			"Expect the unexpected",
			"title",
			"v3",
			14 * SECOND,
			5 * SECOND,
			{
				text: "EXPECT THE UNEXPECTED",
				x: 0,
				y: 26,
				scale: 0.7,
				fadeIn: SECOND / 2,
				fadeOut: SECOND / 2,
			},
		),
		makeClip(
			"wide-audio",
			"zone",
			"Marsh · sync",
			"audio",
			"a1",
			0,
			6 * SECOND,
			{ linkId: "wide-pair", gain: 0.75 },
		),
		makeClip(
			"action-audio",
			"encounter",
			"Encounter · sync",
			"audio",
			"a1",
			6 * SECOND,
			7 * SECOND,
			{ linkId: "action-pair", gain: 0.75 },
		),
		makeClip(
			"return-audio",
			"zone",
			"Zone · sync",
			"audio",
			"a1",
			13 * SECOND,
			7 * SECOND,
			{ sourceIn: 5 * SECOND, linkId: "return-pair", gain: 0.75 },
		),
		makeClip(
			"ending-audio",
			"detail",
			"Creature · sync",
			"audio",
			"a1",
			20 * SECOND,
			5 * SECOND,
			{ linkId: "ending-pair", gain: 0.75 },
		),
		makeClip("score", "score", "Low tension", "audio", "a2", 0, 25 * SECOND, {
			gain: 0.5,
			fadeIn: 2 * SECOND,
			fadeOut: 3 * SECOND,
		}),
		makeClip(
			"atmos",
			"zone",
			"Distant movement",
			"audio",
			"a3",
			15 * SECOND,
			6 * SECOND,
			{ sourceIn: 6 * SECOND, gain: 0.25, fadeIn: SECOND, fadeOut: SECOND },
		),
	],
	markers: [
		{ id: "intro", at: SECOND, name: "Establish the world" },
		{ id: "encounter-mark", at: 6 * SECOND, name: "First encounter" },
		{ id: "resolve", at: 20 * SECOND, name: "Final beat" },
	],
};
export function selection(state: Sequence, ids: string[], linked: boolean) {
	const groups = new Set(
		state.clips
			.filter((c) => ids.includes(c.id))
			.map((c) => c.linkId)
			.filter(Boolean),
	);
	return state.clips.filter(
		(c) => ids.includes(c.id) || (linked && c.linkId && groups.has(c.linkId)),
	);
}
export function isLocked(state: Sequence, clips: Clip[]) {
	return clips.some(
		(c) => state.tracks.find((t) => t.id === c.trackId)?.locked,
	);
}
export function splitClips(
	state: Sequence,
	ids: string[],
	at: number,
): Sequence {
	const clips = state.clips.flatMap((c) => {
		if (!ids.includes(c.id) || at - c.start < FRAME || end(c) - at < FRAME)
			return [c];
		const offset = at - c.start;
		return [
			{ ...c, duration: offset, fadeOut: 0 },
			{
				...c,
				id: crypto.randomUUID(),
				start: at,
				sourceIn: c.sourceIn + offset,
				duration: c.duration - offset,
				fadeIn: 0,
				linkId: c.linkId ? `${c.linkId}:${at}` : undefined,
			},
		];
	});
	return { ...state, clips };
}
export function moveClips(
	state: Sequence,
	ids: string[],
	delta: number,
	targetTrack?: string,
): Sequence {
	const picked = state.clips.filter((c) => ids.includes(c.id));
	if (!picked.length || isLocked(state, picked)) return state;
	const d = Math.max(-Math.min(...picked.map((c) => c.start)), frame(delta));
	const lead = picked.find((c) => c.id === ids[0]) ?? picked[0];
	const target = state.tracks.find((t) => t.id === targetTrack);
	if (
		target?.locked ||
		(target && (lead.kind === "audio") !== (target.kind === "audio"))
	)
		return state;
	const moved = picked.map((c) => ({
		...c,
		start: c.start + d,
		trackId: target && c.trackId === lead.trackId ? target.id : c.trackId,
	}));
	if (
		moved.some((c) =>
			state.clips.some(
				(other) =>
					!ids.includes(other.id) &&
					other.trackId === c.trackId &&
					c.start < end(other) &&
					end(c) > other.start,
			),
		)
	)
		return state;
	return {
		...state,
		clips: state.clips.map((c) => moved.find((m) => m.id === c.id) ?? c),
	};
}
export function removeClips(
	state: Sequence,
	ids: string[],
	ripple: boolean,
): Sequence {
	const removed = state.clips.filter((c) => ids.includes(c.id));
	if (isLocked(state, removed)) return state;
	return {
		...state,
		clips: state.clips
			.filter((c) => !ids.includes(c.id))
			.map((c) =>
				ripple
					? {
							...c,
							start:
								c.start -
								removed
									.filter((r) => r.trackId === c.trackId && end(r) <= c.start)
									.reduce((sum, r) => sum + r.duration, 0),
						}
					: c,
			),
	};
}
export function resizeClips(
	state: Sequence,
	ids: string[],
	leadId: string,
	edge: "in" | "out",
	delta: number,
	assets: Asset[],
): Sequence {
	const picked = state.clips.filter((c) => ids.includes(c.id));
	if (!picked.length || isLocked(state, picked)) return state;
	let low = Number.NEGATIVE_INFINITY;
	let high = Number.POSITIVE_INFINITY;
	for (const c of picked) {
		const limit =
			assets.find((a) => a.id === c.assetId)?.duration ?? 120 * SECOND;
		const siblings = state.clips.filter(
			(o) => !ids.includes(o.id) && o.trackId === c.trackId,
		);
		if (edge === "in") {
			low = Math.max(
				low,
				-c.sourceIn,
				Math.max(0, ...siblings.filter((o) => end(o) <= c.start).map(end)) -
					c.start,
			);
			high = Math.min(high, c.duration - FRAME);
		} else {
			low = Math.max(low, FRAME - c.duration);
			high = Math.min(
				high,
				limit - c.sourceIn - c.duration,
				Math.min(
					Number.POSITIVE_INFINITY,
					...siblings.filter((o) => o.start >= end(c)).map((o) => o.start),
				) - end(c),
			);
		}
	}
	if (!picked.some((c) => c.id === leadId)) return state;
	const d = clamp(frame(delta), low, high);
	return {
		...state,
		clips: state.clips.map((c) =>
			!ids.includes(c.id)
				? c
				: edge === "in"
					? {
							...c,
							start: c.start + d,
							sourceIn: c.sourceIn + d,
							duration: c.duration - d,
						}
					: { ...c, duration: c.duration + d },
		),
	};
}
export function placeClips(
	state: Sequence,
	additions: Clip[],
	mode: "insert" | "overwrite",
): Sequence {
	if (isLocked(state, additions)) return state;
	let clips = state.clips;
	for (const add of additions) {
		clips = clips.flatMap((c) => {
			if (c.trackId !== add.trackId) return [c];
			if (mode === "insert") {
				if (c.start >= add.start)
					return [{ ...c, start: c.start + add.duration }];
				if (end(c) > add.start) {
					const offset = add.start - c.start;
					return [
						{ ...c, duration: offset, fadeOut: 0 },
						{
							...c,
							id: crypto.randomUUID(),
							linkId: c.linkId ? `${c.linkId}:insert:${add.start}` : undefined,
							start: add.start + add.duration,
							sourceIn: c.sourceIn + offset,
							duration: c.duration - offset,
							fadeIn: 0,
						},
					];
				}
				return [c];
			}
			if (end(c) <= add.start || c.start >= end(add)) return [c];
			const pieces: Clip[] = [];
			if (c.start < add.start)
				pieces.push({ ...c, duration: add.start - c.start, fadeOut: 0 });
			if (end(c) > end(add))
				pieces.push({
					...c,
					id: crypto.randomUUID(),
					linkId: c.linkId ? `${c.linkId}:overwrite:${end(add)}` : undefined,
					start: end(add),
					sourceIn: c.sourceIn + end(add) - c.start,
					duration: end(c) - end(add),
					fadeIn: 0,
				});
			return pieces;
		});
		clips = [...clips, add];
	}
	return { ...state, clips };
}
