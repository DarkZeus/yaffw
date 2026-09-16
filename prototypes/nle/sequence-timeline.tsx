import {
	Eye,
	EyeOff,
	Flag,
	Link2,
	LockKeyhole,
	UnlockKeyhole,
	Volume2,
	VolumeX,
} from "lucide-react";
import type { ReactNode } from "react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { EditableName } from "./editable-name";
import {
	type Clip,
	FRAME,
	SECOND,
	type Sequence,
	type Track,
	clamp,
	end,
	frame,
	isLocked,
	moveClips,
	resizeClips,
	selection,
	time,
} from "./model";
import { TrackResizeHandle, defaultTrackHeight } from "./track-resize-handle";
import type { Editor } from "./use-editor";
export function Waveform({ clip, editor }: { clip: Clip; editor: Editor }) {
	const asset = editor.assets.find((a) => a.id === clip.assetId);
	if (!asset?.peaks)
		return (
			<div className="audio-unanalysed">
				<Volume2 size={13} />
				<span>
					{asset?.id === "score" ? "Low tension · audio bed" : "Audio clip"}
				</span>
			</div>
		);
	const begin = Math.floor(clip.sourceIn / 50_000);
	const values = asset.peaks.slice(
		begin,
		begin + Math.ceil(clip.duration / 50_000),
	);
	return (
		<svg
			className="waveform"
			viewBox={`0 0 ${Math.max(1, values.length) * 3} 40`}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{values.map((v, i) => (
				<path
					key={`${begin + i}`}
					d={`M${i * 3 + 1} ${20 - Math.sqrt(v) * 17}v${Math.max(2, Math.sqrt(v) * 34)}`}
				/>
			))}
		</svg>
	);
}
function ClipView({
	clip,
	track,
	editor,
	extent,
	onContext,
}: {
	clip: Clip;
	track: Track;
	editor: Editor;
	extent: number;
	onContext: (x: number, y: number, id: string) => void;
}) {
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const drag = useRef<{
		x: number;
		y: number;
		scale: number;
		snapshot: Sequence;
		ids: string[];
		edge?: "in" | "out";
		next: Sequence;
		moved: boolean;
		delta: number;
		trackId: string;
	} | null>(null);
	const asset = editor.assets.find((a) => a.id === clip.assetId);
	const selected = editor.picked.some((c) => c.id === clip.id);
	function down(e: PointerEvent<HTMLButtonElement>, edge?: "in" | "out") {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		editor.setPlaying(false);
		if (e.shiftKey && !edge) {
			editor.select(clip, true);
			return;
		}
		const picked = selected
			? editor.picked
			: selection(editor.state, [clip.id], editor.linked);
		if (!selected) editor.select(clip);
		if (track.locked || isLocked(editor.state, picked)) {
			editor.setMessage("Track locked");
			return;
		}
		const box = e.currentTarget
			.closest(".track-content")
			?.getBoundingClientRect();
		if (!box) return;
		if (editor.tool === "blade" && !edge) {
			editor.splitAt(((e.clientX - box.left) / box.width) * extent, clip.id);
			return;
		}
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = {
			x: e.clientX,
			y: e.clientY,
			scale: extent / box.width,
			snapshot: editor.state,
			ids: [
				clip.id,
				...picked.filter((c) => c.id !== clip.id).map((c) => c.id),
			],
			edge,
			next: editor.state,
			moved: false,
			delta: 0,
			trackId: track.id,
		};
	}
	function move(e: PointerEvent<HTMLButtonElement>) {
		const d = drag.current;
		if (!d) return;
		const dx = e.clientX - d.x;
		const dy = e.clientY - d.y;
		if (!d.moved && Math.hypot(dx, dy) < 3) return;
		d.moved = true;
		let delta = frame(dx * d.scale);
		if (d.edge) {
			d.next = resizeClips(
				d.snapshot,
				d.ids,
				clip.id,
				d.edge,
				delta,
				editor.assets,
			);
			editor.setDraft(d.next);
			return;
		}
		if (editor.snap) {
			const points = [
				0,
				editor.playhead,
				...d.snapshot.markers.map((m) => m.at),
				...d.snapshot.clips
					.filter((c) => !d.ids.includes(c.id))
					.flatMap((c) => [c.start, end(c)]),
			];
			const closest = points.reduce(
				(best, p) =>
					Math.abs(p - (clip.start + delta)) <
					Math.abs(best - (clip.start + delta))
						? p
						: best,
				Number.POSITIVE_INFINITY,
			);
			if (Math.abs(closest - (clip.start + delta)) < 8 * d.scale)
				delta = closest - clip.start;
		}
		const row = Array.from(
			document.querySelectorAll<HTMLElement>(".track-row"),
		).find((el) => {
			const r = el.getBoundingClientRect();
			return e.clientY >= r.top && e.clientY < r.bottom;
		});
		d.trackId = row?.dataset.trackId ?? track.id;
		d.delta = delta;
		d.next = moveClips(d.snapshot, d.ids, delta, d.trackId);
		setOffset({ x: delta / d.scale, y: dy });
	}
	function finish(e: PointerEvent<HTMLButtonElement>) {
		const d = drag.current;
		drag.current = null;
		setOffset({ x: 0, y: 0 });
		if (!d) return;
		if (e.currentTarget.hasPointerCapture(e.pointerId))
			e.currentTarget.releasePointerCapture(e.pointerId);
		if (d.moved)
			editor.commit(
				d.next,
				d.next === d.snapshot
					? "Move blocked · check track type, lock, or occupied space"
					: d.edge
						? "Clip edges updated"
						: `Moved ${d.ids.length} clip${d.ids.length === 1 ? "" : "s"}`,
			);
	}
	function cancel() {
		drag.current = null;
		setOffset({ x: 0, y: 0 });
		editor.setDraft(null);
	}
	const events = {
		onPointerMove: move,
		onPointerUp: finish,
		onPointerCancel: cancel,
		onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
			if (e.key === "Escape") cancel();
		},
	};
	return (
		<div
			className={`sequence-clip kind-${clip.kind} ${selected ? "selected" : ""} ${track.locked ? "locked" : ""} ${offset.x || offset.y ? "dragging" : ""}`}
			data-clip-id={clip.id}
			style={{
				left: `${(clip.start / extent) * 100}%`,
				width: `${(clip.duration / extent) * 100}%`,
				transform:
					offset.x || offset.y
						? `translate(${offset.x}px,${offset.y}px)`
						: undefined,
			}}
			onContextMenu={(e) => {
				e.preventDefault();
				editor.select(clip);
				onContext(e.clientX, e.clientY, clip.id);
			}}
		>
			<button
				type="button"
				className="clip-face"
				aria-label={`Select ${clip.name} on ${track.name}`}
				aria-pressed={selected}
				onPointerDown={(e) => down(e)}
				{...events}
				onClick={(e) => {
					if (e.detail === 0) editor.select(clip);
				}}
			>
				{clip.kind === "audio" ? (
					<Waveform clip={clip} editor={editor} />
				) : clip.kind === "title" ? (
					<div className="title-clip-art">
						T<span>{clip.text}</span>
					</div>
				) : (
					<div
						className="clip-filmstrip"
						style={{ backgroundImage: `url("${asset?.poster}")` }}
					/>
				)}
				<span className="clip-label">
					{clip.linkId && <Link2 size={9} />}
					<span>{clip.name}</span>
					<small>{time(clip.duration)}</small>
				</span>
				{clip.fadeIn > 0 && (
					<span
						className="fade-wedge fade-in"
						style={{ width: `${(clip.fadeIn / clip.duration) * 100}%` }}
					/>
				)}
				{clip.fadeOut > 0 && (
					<span
						className="fade-wedge fade-out"
						style={{ width: `${(clip.fadeOut / clip.duration) * 100}%` }}
					/>
				)}
			</button>
			<button
				type="button"
				className="edge edge-in"
				aria-label={`Start edge ${clip.name} on ${track.name}`}
				disabled={track.locked}
				onPointerDown={(e) => down(e, "in")}
				{...events}
			/>
			<button
				type="button"
				className="edge edge-out"
				aria-label={`End edge ${clip.name} on ${track.name}`}
				disabled={track.locked}
				onPointerDown={(e) => down(e, "out")}
				{...events}
			/>
		</div>
	);
}
export function SequenceTimeline({
	editor,
	toolbar,
}: { editor: Editor; toolbar: ReactNode }) {
	const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});

	const extent = Math.max(30 * SECOND, editor.total + 3 * SECOND);
	const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
		null,
	);
	const scroll = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!menu) return;
		function close(e: globalThis.PointerEvent) {
			if (e.target instanceof Element && !e.target.closest(".clip-menu"))
				setMenu(null);
		}
		window.addEventListener("pointerdown", close);
		return () => window.removeEventListener("pointerdown", close);
	}, [menu]);
	function scrub(e: PointerEvent<HTMLButtonElement>) {
		if (
			e.type === "pointermove" &&
			!e.currentTarget.hasPointerCapture(e.pointerId)
		)
			return;
		if (e.type === "pointerdown") {
			e.currentTarget.setPointerCapture(e.pointerId);
			editor.setPlaying(false);
		}
		const box = e.currentTarget.getBoundingClientRect();
		editor.seek(((e.clientX - box.left) / box.width) * extent);
	}
	const canSplit = editor.picked.some(
		(c) =>
			editor.playhead - c.start >= FRAME && end(c) - editor.playhead >= FRAME,
	);
	return (
		<section className="timeline-panel panel">
			{toolbar}
			<div className="timeline-scroll" ref={scroll}>
				<div
					className="timeline-canvas"
					style={{ width: `${editor.zoom * 100}%` }}
				>
					<div className="time-ruler">
						<div className="time-readout">
							<code>{time(editor.playhead)}</code>
						</div>
						<div className="ruler-region">
							<div className="marker-rail">
								{editor.state.markers.map((m) => (
									<button
										type="button"
										key={m.id}
										aria-label={`Marker ${m.name}`}
										style={{ left: `${(m.at / extent) * 100}%` }}
										onClick={() => editor.seek(m.at)}
									>
										<Flag size={10} fill="currentColor" />
										<span>{m.name}</span>
									</button>
								))}
							</div>
							<button
								type="button"
								className="ruler-ticks"
								aria-label="Seek sequence"
								onPointerDown={scrub}
								onPointerMove={scrub}
								onPointerUp={(e) => {
									if (e.currentTarget.hasPointerCapture(e.pointerId))
										e.currentTarget.releasePointerCapture(e.pointerId);
								}}
							>
								{Array.from(
									{ length: Math.ceil(extent / SECOND) },
									(_, n) => n * SECOND,
								).map((at) => (
									<span
										key={at}
										className={(at / SECOND) % 5 === 0 ? "major" : "minor"}
										style={{ left: `${(at / extent) * 100}%` }}
									>
										{(at / SECOND) % 5 === 0
											? `${Math.floor(at / SECOND)}s`
											: ""}
									</span>
								))}
							</button>
						</div>
					</div>
					<div className="track-stack">
						{editor.state.tracks.map((track, index) => (
							<div
								key={track.id}
								className={`track-row track-${track.kind} ${index > 0 && editor.state.tracks[index - 1].kind !== track.kind ? "track-section-start" : ""} ${track.hidden || track.muted ? "track-dimmed" : ""}`}
								data-track-id={track.id}
								data-density={
									(trackHeights[track.id] ?? defaultTrackHeight(track)) < 40
										? "compact"
										: (trackHeights[track.id] ?? defaultTrackHeight(track)) < 72
											? "standard"
											: "expanded"
								}
								style={{
									height: trackHeights[track.id] ?? defaultTrackHeight(track),
								}}
							>
								<div className="track-head">
									<TrackResizeHandle
										track={track}
										height={trackHeights[track.id] ?? defaultTrackHeight(track)}
										onHeightChange={(height) =>
											setTrackHeights((heights) => ({
												...heights,
												[track.id]: height,
											}))
										}
									/>
									<div className="track-title">
										<button
											type="button"
											aria-label={`Target ${track.name}`}
											className="track-target"
											aria-pressed={editor.targetTrack === track.id}
											onClick={() => editor.setTargetTrack(track.id)}
										>
											{track.kind === "video" ? "V" : "A"}
											{track.kind === "video"
												? editor.state.tracks.filter((t) => t.kind === "video")
														.length - index
												: editor.state.tracks
														.filter((t) => t.kind === "audio")
														.findIndex((t) => t.id === track.id) + 1}
										</button>
										<EditableName
											className="track-name"
											label={`Rename ${track.name} track`}
											name={track.name}
											onRename={(name) => editor.patchTrack(track.id, { name })}
										/>
									</div>
									<div className="track-controls">
										<button
											type="button"
											className="icon"
											aria-label={`${track.locked ? "Unlock" : "Lock"} ${track.name} track`}
											aria-pressed={track.locked}
											onClick={() =>
												editor.patchTrack(track.id, { locked: !track.locked })
											}
										>
											{track.locked ? (
												<LockKeyhole size={11} />
											) : (
												<UnlockKeyhole size={11} />
											)}
										</button>
										{track.kind === "video" ? (
											<button
												type="button"
												className="icon"
												aria-label={`${track.hidden ? "Show" : "Hide"} ${track.name} track`}
												aria-pressed={track.hidden}
												onClick={() =>
													editor.patchTrack(track.id, { hidden: !track.hidden })
												}
											>
												{track.hidden ? (
													<EyeOff size={12} />
												) : (
													<Eye size={12} />
												)}
											</button>
										) : (
											<>
												<button
													type="button"
													className="icon"
													aria-label={`${track.muted ? "Unmute" : "Mute"} ${track.name} track`}
													aria-pressed={track.muted}
													onClick={() =>
														editor.patchTrack(track.id, { muted: !track.muted })
													}
												>
													{track.muted ? (
														<VolumeX size={12} />
													) : (
														<Volume2 size={12} />
													)}
												</button>
												<button
													type="button"
													className="solo-button"
													aria-label={`Solo ${track.name} track`}
													aria-pressed={track.solo}
													onClick={() =>
														editor.patchTrack(track.id, { solo: !track.solo })
													}
												>
													S
												</button>
											</>
										)}
									</div>
								</div>
								<div
									className="track-content"
									onDragOver={(e) => {
										if (!track.locked) {
											e.preventDefault();
											e.dataTransfer.dropEffect = "copy";
										}
									}}
									onDrop={(e) => {
										e.preventDefault();
										const id = e.dataTransfer.getData(
											"application/yaffw-asset",
										);
										const asset = editor.assets.find((a) => a.id === id);
										if (!asset) return;
										const rect = e.currentTarget.getBoundingClientRect();
										const at = frame(
											clamp(
												((e.clientX - rect.left) / rect.width) * extent,
												0,
												extent,
											),
										);
										if ((asset.kind === "audio") !== (track.kind === "audio")) {
											editor.setMessage(
												"Drop video, images, and titles on video tracks; audio on audio tracks",
											);
											return;
										}
										editor.addAsset(asset, "overwrite", at, track.id);
									}}
								>
									{editor.state.clips
										.filter((c) => c.trackId === track.id)
										.map((c) => (
											<ClipView
												key={c.id}
												clip={c}
												track={track}
												editor={editor}
												extent={extent}
												onContext={(x, y, id) => setMenu({ x, y, id })}
											/>
										))}
									{!editor.state.clips.some((c) => c.trackId === track.id) && (
										<span className="empty-track">
											Drop {track.kind === "audio" ? "audio" : "media"} here
										</span>
									)}
								</div>
							</div>
						))}
						<div className="playhead-plane">
							<div
								className="sequence-playhead"
								style={{ left: `${(editor.playhead / extent) * 100}%` }}
							>
								<span />
							</div>
						</div>
					</div>
				</div>
			</div>
			{menu && (
				<div
					role="menu"
					aria-label="Clip actions"
					className="clip-menu"
					style={{
						left: Math.min(menu.x, window.innerWidth - 190),
						top: Math.min(menu.y, window.innerHeight - 190),
					}}
				>
					{[
						{
							name: "Split at playhead",
							run: () => editor.splitAt(),
							disabled: !canSplit,
						},
						{ name: "Duplicate", run: editor.duplicate },
						{
							name: "Unlink audio / video",
							run: editor.unlink,
							disabled: !editor.selected?.linkId,
						},
						{ name: "Delete", run: editor.remove },
					].map((item) => (
						<button
							type="button"
							role="menuitem"
							disabled={item.disabled}
							key={item.name}
							onClick={() => {
								item.run();
								setMenu(null);
							}}
						>
							{item.name}
						</button>
					))}
					<button type="button" role="menuitem" onClick={() => setMenu(null)}>
						Close
					</button>
				</div>
			)}
		</section>
	);
}
