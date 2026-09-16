import { useCallback, useEffect, useRef, useState } from "react";
import { initialAssets } from "./assets";
import {
	type Asset,
	type Clip,
	SECOND,
	type Sequence,
	type Track,
	clamp,
	duration,
	end,
	frame,
	initialSequence,
	isLocked,
	makeClip,
	makeTrack,
	placeClips,
	removeClips,
	selection,
	splitClips,
} from "./model";

export function useEditor() {
	const [history, setHistory] = useState<{
		past: Sequence[];
		present: Sequence;
		future: Sequence[];
	}>({ past: [], present: initialSequence, future: [] });
	const [draft, setDraft] = useState<Sequence | null>(null);
	const [assets, setAssets] = useState(initialAssets);
	const [selectedIds, setSelectedIds] = useState(["detail-insert"]);
	const [sourceId, setSourceId] = useState("encounter");
	const [targetTrack, setTargetTrack] = useState("v1");
	const [playhead, setPlayhead] = useState(8 * SECOND);
	const [masterGain, setMasterGain] = useState(1);
	const [playing, setPlaying] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [snap, setSnap] = useState(true);
	const [linked, setLinked] = useState(true);
	const [ripple, setRipple] = useState(false);
	const [muted, setMuted] = useState(false);
	const [loop, setLoop] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [tool, setTool] = useState<"select" | "blade">("select");
	const [message, setMessage] = useState("");
	const [importing, setImporting] = useState(false);
	const urls = useRef<string[]>([]);
	const alive = useRef(true);
	const state = draft ?? history.present;
	const total = duration(state.clips);
	const picked = selection(state, selectedIds, linked);
	const selected = state.clips.find((c) => c.id === selectedIds[0]);
	const source = assets.find((a) => a.id === sourceId) ?? assets[0];
	const commit = useCallback(
		(next: Sequence, label = "Sequence updated", pause = true) => {
			if (pause) setPlaying(false);
			setDraft(null);
			setHistory((h) =>
				JSON.stringify(h.present) === JSON.stringify(next)
					? h
					: {
							past: [...h.past.slice(-59), h.present],
							present: next,
							future: [],
						},
			);
			setMessage(label);
		},
		[],
	);
	const undo = useCallback(() => {
		setPlaying(false);
		setDraft(null);
		setHistory((h) =>
			h.past.length
				? {
						past: h.past.slice(0, -1),
						present: h.past[h.past.length - 1],
						future: [h.present, ...h.future],
					}
				: h,
		);
		setMessage("Undid edit");
	}, []);
	const redo = useCallback(() => {
		setPlaying(false);
		setDraft(null);
		setHistory((h) =>
			h.future.length
				? {
						past: [...h.past, h.present],
						present: h.future[0],
						future: h.future.slice(1),
					}
				: h,
		);
		setMessage("Restored edit");
	}, []);
	const seek = useCallback(
		(at: number) => setPlayhead(clamp(frame(at), 0, total)),
		[total],
	);
	function select(c: Clip, extend = false) {
		setSelectedIds((ids) =>
			extend
				? ids.includes(c.id)
					? ids.filter((id) => id !== c.id)
					: [...ids, c.id]
				: [c.id],
		);
		setTargetTrack(c.trackId);
	}
	function selectSource(id: string) {
		setSourceId(id);
	}
	function editable(clips = picked) {
		if (isLocked(state, clips)) {
			setMessage("Unlock the selected tracks to edit these clips");
			return false;
		}
		return true;
	}
	function patchClip(patch: Partial<Clip>) {
		if (!selected || !editable([selected])) return;
		commit(
			{
				...state,
				clips: state.clips.map((c) =>
					c.id === selected.id ? { ...c, ...patch } : c,
				),
			},
			"Clip properties updated",
		);
	}
	function patchTrack(id: string, patch: Partial<Track>) {
		commit(
			{
				...state,
				tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
			},
			"Track updated",
			false,
		);
	}
	function addTrack(kind: Track["kind"]) {
		const id = crypto.randomUUID();
		const count = state.tracks.filter((t) => t.kind === kind).length + 1;
		const track = makeTrack(
			id,
			kind === "video" ? `Video ${count}` : `Audio ${count}`,
			kind,
		);
		commit(
			{
				...state,
				tracks:
					kind === "video"
						? [track, ...state.tracks]
						: [...state.tracks, track],
			},
			`${track.name} added`,
		);
		setTargetTrack(id);
		return id;
	}
	function addAsset(
		asset: Asset,
		mode: "insert" | "overwrite" | "append" = "insert",
		atOverride?: number,
		trackOverride?: string,
	) {
		const kind = asset.kind === "audio" ? "audio" : "video";
		const track =
			state.tracks.find(
				(t) => t.id === (trackOverride ?? targetTrack) && t.kind === kind,
			) ??
			state.tracks.find((t) => t.id === (kind === "audio" ? "a2" : "v1")) ??
			state.tracks.find((t) => t.kind === kind);
		if (!track || track.locked) {
			setMessage("Choose an unlocked destination track");
			return;
		}
		const sourceIn = 0;
		const length =
			asset.kind === "title"
				? 4 * SECOND
				: Math.min(
						asset.duration - sourceIn,
						asset.kind === "audio" ? asset.duration : 6 * SECOND,
					);
		const at =
			atOverride ??
			(mode === "append"
				? duration(state.clips.filter((c) => c.trackId === track.id))
				: playhead);
		const id = crypto.randomUUID();
		const group = asset.hasAudio ? crypto.randomUUID() : undefined;
		const clip = makeClip(
			id,
			asset.id,
			asset.kind === "title" ? "New title" : asset.name,
			asset.kind,
			track.id,
			frame(at),
			length,
			{
				sourceIn,
				linkId: group,
				text: asset.kind === "title" ? "YOUR STORY STARTS HERE" : "",
				fadeIn: asset.kind === "title" ? SECOND / 2 : 0,
				fadeOut: asset.kind === "title" ? SECOND / 2 : 0,
			},
		);
		const additions = [clip];
		if (group) {
			const audio =
				state.tracks.find((t) => t.id === "a1") ??
				state.tracks.find((t) => t.kind === "audio");
			if (audio) {
				if (audio.locked) {
					setMessage(
						"Production audio is locked; unlock it before inserting linked media",
					);
					return;
				}
				additions.push(
					makeClip(
						crypto.randomUUID(),
						asset.id,
						`${asset.name} · audio`,
						"audio",
						audio.id,
						clip.start,
						length,
						{ sourceIn, linkId: group },
					),
				);
			}
		}
		commit(
			placeClips(
				state,
				additions,
				mode === "overwrite" ? "overwrite" : "insert",
			),
			`${mode === "overwrite" ? "Overwrote" : mode === "append" ? "Appended" : "Inserted"} ${asset.name}`,
		);
		setSelectedIds([id]);
		setPlayhead(at);
	}
	function addTitle() {
		const title = assets.find((a) => a.kind === "title");
		if (title)
			addAsset(
				title,
				"overwrite",
				playhead,
				state.tracks.find((t) => t.kind === "video")?.id,
			);
	}
	function splitAt(at = playhead, leadId?: string) {
		let clips = leadId ? selection(state, [leadId], linked) : picked;
		if (!clips.length)
			clips = state.clips.filter(
				(c) => c.trackId === targetTrack && c.start < at && end(c) > at,
			);
		if (!editable(clips)) return;
		const next = splitClips(
			state,
			clips.map((c) => c.id),
			frame(at),
		);
		commit(next, "Clips split at playhead");
	}
	function remove() {
		if (!picked.length || !editable()) return;
		commit(
			removeClips(
				state,
				picked.map((c) => c.id),
				ripple,
			),
			ripple
				? "Ripple deleted selection"
				: "Deleted selection · gaps preserved",
		);
		setSelectedIds([]);
	}
	function duplicate() {
		if (!picked.length || !editable()) return;
		const start = Math.min(...picked.map((c) => c.start));
		const offset = Math.max(...picked.map(end)) - start;
		const groups = new Map<string, string>();
		const additions = picked.map((c) => {
			if (c.linkId && !groups.has(c.linkId))
				groups.set(c.linkId, crypto.randomUUID());
			return {
				...c,
				id: crypto.randomUUID(),
				start: c.start + offset,
				linkId: c.linkId ? groups.get(c.linkId) : undefined,
			};
		});
		commit(placeClips(state, additions, "insert"), "Duplicated selection");
		setSelectedIds(additions.map((c) => c.id));
	}
	function unlink() {
		if (
			!selected?.linkId ||
			!editable(state.clips.filter((c) => c.linkId === selected.linkId))
		)
			return;
		commit(
			{
				...state,
				clips: state.clips.map((c) =>
					c.linkId === selected.linkId ? { ...c, linkId: undefined } : c,
				),
			},
			"Video and audio can now be edited independently",
		);
	}
	function marker() {
		commit(
			{
				...state,
				markers: [
					...state.markers,
					{
						id: crypto.randomUUID(),
						at: frame(playhead),
						name: `Marker ${state.markers.length + 1}`,
					},
				].sort((a, b) => a.at - b.at),
			},
			"Sequence marker added",
		);
	}
	function download() {
		const data = {
			version: 2,
			name: state.name,
			timebase: "microseconds",
			sequence: state,
			assets: assets.map(({ id, name, kind, duration }) => ({
				id,
				name,
				kind,
				duration,
			})),
		};
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = "yaffw-sequence.json";
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		setMessage("Sequence file saved · source media stays on your computer");
	}
	async function importFiles(files: File[]) {
		setImporting(true);
		for (const file of files) {
			const url = URL.createObjectURL(file);
			urls.current.push(url);
			let media: HTMLMediaElement | undefined;
			try {
				const kind: Asset["kind"] = file.type.startsWith("audio/")
					? "audio"
					: file.type.startsWith("image/")
						? "image"
						: "video";
				let length = 5 * SECOND;
				let poster = "";
				if (kind === "image") {
					const img = new Image();
					img.src = url;
					await img.decode();
					poster = url;
				} else {
					media = document.createElement(kind === "audio" ? "audio" : "video");
					media.preload = "auto";
					media.src = url;
					await new Promise<void>((resolve, reject) => {
						const timer = setTimeout(
							() => reject(new Error("Media took too long to open")),
							15000,
						);
						media?.addEventListener(
							"loadeddata",
							() => {
								clearTimeout(timer);
								resolve();
							},
							{ once: true },
						);
						media?.addEventListener(
							"error",
							() => {
								clearTimeout(timer);
								reject(new Error("Unsupported media file"));
							},
							{ once: true },
						);
					});
					if (!Number.isFinite(media.duration) || media.duration <= 0)
						throw new Error("Unknown media duration");
					length = Math.round(media.duration * SECOND);
					if (media instanceof HTMLVideoElement) {
						const canvas = document.createElement("canvas");
						canvas.width = 240;
						canvas.height = Math.max(
							1,
							Math.round((240 * media.videoHeight) / media.videoWidth),
						);
						canvas
							.getContext("2d")
							?.drawImage(media, 0, 0, canvas.width, canvas.height);
						poster = canvas.toDataURL("image/jpeg", 0.8);
					}
				}
				const asset: Asset = {
					id: crypto.randomUUID(),
					name: file.name,
					kind,
					url,
					poster,
					duration: length,
					hasAudio: kind === "video",
				};
				if (alive.current) {
					setAssets((a) => [...a, asset]);
					setSourceId(asset.id);
					setMessage(`Imported ${file.name}`);
				}
			} catch (error) {
				URL.revokeObjectURL(url);
				if (alive.current)
					setMessage(
						error instanceof Error ? error.message : "Could not open media",
					);
			} finally {
				media?.pause();
				media?.removeAttribute("src");
				media?.load();
			}
		}
		if (alive.current) setImporting(false);
	}
	function togglePlayback() {
		if (!playing && playhead >= total) setPlayhead(0);
		setPlaying((p) => !p && total > 0);
	}
	useEffect(() => {
		setPlayhead((p) => Math.min(p, total));
	}, [total]);
	useEffect(() => {
		if (!playing) return;
		let last = performance.now();
		let request = 0;
		function tick(now: number) {
			const delta = (now - last) * 1000 * speed;
			last = now;
			setPlayhead((p) =>
				p + delta >= total
					? loop && total > 0
						? (p + delta) % total
						: total
					: p + delta,
			);
			request = requestAnimationFrame(tick);
		}
		request = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(request);
	}, [playing, total, loop, speed]);
	useEffect(() => {
		if (playing && !loop && playhead >= total) setPlaying(false);
	}, [playhead, playing, loop, total]);
	useEffect(() => {
		function key(e: KeyboardEvent) {
			const target = e.target;
			if (
				target instanceof HTMLElement &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
					target.isContentEditable)
			)
				return;
			if (document.querySelector("dialog[open]")) return;
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
				e.preventDefault();
				e.shiftKey ? redo() : undo();
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "a") {
				e.preventDefault();
				setSelectedIds(
					state.clips
						.filter(
							(c) => !state.tracks.find((t) => t.id === c.trackId)?.locked,
						)
						.map((c) => c.id),
				);
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.code === "Space") {
				e.preventDefault();
				togglePlayback();
			}
			if (e.key.toLowerCase() === "b") setTool("blade");
			if (e.key.toLowerCase() === "v") setTool("select");
			if (e.key.toLowerCase() === "s") splitAt();
			if (e.key.toLowerCase() === "m") marker();
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				remove();
			}
			if (e.key === "Escape") {
				setDraft(null);
				setSelectedIds([]);
				setTool("select");
			}
		}
		document.addEventListener("keydown", key);
		return () => document.removeEventListener("keydown", key);
	});
	useEffect(
		() => () => {
			alive.current = false;
			for (const url of urls.current) URL.revokeObjectURL(url);
		},
		[],
	);
	return {
		state,
		assets,
		selected,
		picked,
		selectedIds,
		setSelectedIds,
		source,
		selectSource,
		targetTrack,
		setTargetTrack,
		playhead,
		seek,
		masterGain,
		setMasterGain,
		playing,
		setPlaying,
		togglePlayback,
		total,
		zoom,
		setZoom,
		snap,
		setSnap,
		linked,
		setLinked,
		ripple,
		setRipple,
		muted,
		setMuted,
		loop,
		setLoop,
		speed,
		setSpeed,
		tool,
		setTool,
		message,
		setMessage,
		importing,
		importFiles,
		commit,
		setDraft,
		select,
		patchClip,
		patchTrack,
		addTrack,
		addAsset,
		addTitle,
		splitAt,
		remove,
		duplicate,
		unlink,
		marker,
		download,
		undo,
		redo,
		canUndo: history.past.length > 0,
		canRedo: history.future.length > 0,
	};
}
export type Editor = ReturnType<typeof useEditor>;
