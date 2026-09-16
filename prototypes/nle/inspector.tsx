import { converter, formatCss, formatHex } from "culori";
import {
	Copy,
	Flag,
	Link2Off,
	LockKeyhole,
	SlidersHorizontal,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import { type Clip, SECOND, moveClips, time } from "./model";
import type { Editor } from "./use-editor";
function Numeric({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	suffix = "",
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
}) {
	return (
		<label className="property">
			<span>{label}</span>
			<div>
				<input
					aria-label={label}
					type="number"
					min={min}
					max={max}
					step={step}
					value={Math.round(value * 100) / 100}
					onChange={(e) => {
						const n = e.currentTarget.valueAsNumber;
						if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
					}}
				/>
				{suffix && <small>{suffix}</small>}
			</div>
		</label>
	);
}
export function Inspector({ editor }: { editor: Editor }) {
	const [tab, setTab] = useState("clip");
	const c = editor.selected;
	const locked = editor.state.tracks.find((t) => t.id === c?.trackId)?.locked;
	function change<K extends keyof Clip>(key: K, value: Clip[K]) {
		editor.patchClip({ [key]: value });
	}
	return (
		<aside className="inspector panel">
			<div className="inspector-tabs">
				<button
					type="button"
					aria-pressed={tab === "clip"}
					onClick={() => setTab("clip")}
				>
					<SlidersHorizontal size={13} /> Inspector
				</button>
				<button
					type="button"
					aria-pressed={tab === "sequence"}
					onClick={() => setTab("sequence")}
				>
					Sequence
				</button>
			</div>
			<div className="inspector-scroll">
				{tab === "sequence" ? (
					<>
						<h3>Sequence 01</h3>
						<p className="subtle">1920 × 1080 · 30 fps</p>
						<div className="sequence-facts">
							<span>{editor.state.clips.length} clips</span>
							<span>{editor.state.tracks.length} tracks</span>
							<code>{time(editor.total)}</code>
						</div>
						<h4>Markers</h4>
						<button
							type="button"
							className="wide-action"
							onClick={editor.marker}
						>
							<Flag size={13} /> Add at playhead
						</button>
						{editor.state.markers.map((marker) => (
							<div className="marker-item" key={marker.id}>
								<button
									type="button"
									aria-label={`Go to ${marker.name}`}
									onClick={() => editor.seek(marker.at)}
								>
									<code>{time(marker.at)}</code>
								</button>
								<input
									aria-label={`Marker name ${marker.id}`}
									value={marker.name}
									onChange={(e) =>
										editor.commit(
											{
												...editor.state,
												markers: editor.state.markers.map((m) =>
													m.id === marker.id
														? { ...m, name: e.target.value }
														: m,
												),
											},
											"Marker renamed",
										)
									}
								/>
								<button
									type="button"
									className="icon"
									aria-label={`Delete marker ${marker.name}`}
									onClick={() =>
										editor.commit(
											{
												...editor.state,
												markers: editor.state.markers.filter(
													(m) => m.id !== marker.id,
												),
											},
											"Marker deleted",
										)
									}
								>
									<X size={12} />
								</button>
							</div>
						))}
					</>
				) : c ? (
					<>
						<div className="selection-kind">
							<span>{c.kind.toUpperCase()}</span>
							<small>
								{editor.picked.length > 1
									? `${editor.picked.length} clips selected`
									: locked
										? "Track locked"
										: "Selected clip"}
							</small>
						</div>
						<input
							className="name-field"
							aria-label="Clip name"
							value={c.name}
							disabled={locked}
							onChange={(e) => change("name", e.target.value)}
						/>
						<fieldset disabled={locked}>
							<h4>{c.kind === "audio" ? "Audio" : "Transform"}</h4>
							{c.kind === "title" && (
								<>
									<label className="title-label">
										Text
										<textarea
											aria-label="Title text"
											rows={2}
											value={c.text}
											onChange={(e) => change("text", e.target.value)}
										/>
									</label>
									<label className="property">
										<span>Color</span>
										<input
											type="color"
											aria-label="Title color"
											value={formatHex(c.color)}
											onChange={(e) => {
												const color = formatCss(
													converter("oklch")(e.target.value),
												);
												if (color) change("color", color);
											}}
										/>
									</label>
								</>
							)}
							{c.kind !== "audio" ? (
								<>
									<Numeric
										label="Position X"
										value={c.x}
										onChange={(v) => change("x", v)}
										min={-75}
										max={75}
										suffix="%"
									/>
									<Numeric
										label="Position Y"
										value={c.y}
										onChange={(v) => change("y", v)}
										min={-75}
										max={75}
										suffix="%"
									/>
									<Numeric
										label="Scale"
										value={c.scale * 100}
										onChange={(v) => change("scale", v / 100)}
										min={10}
										max={200}
										suffix="%"
									/>
									<label className="slider-property">
										<span>
											Opacity <output>{Math.round(c.opacity * 100)}%</output>
										</span>
										<input
											aria-label="Clip opacity"
											type="range"
											min="0"
											max="100"
											value={c.opacity * 100}
											onChange={(e) =>
												change("opacity", Number(e.target.value) / 100)
											}
										/>
									</label>
									<button
										type="button"
										className="wide-action"
										onClick={() =>
											editor.patchClip({ x: 0, y: 0, scale: 1, opacity: 1 })
										}
									>
										Reset transform
									</button>
								</>
							) : (
								<label className="slider-property">
									<span>
										Clip volume <output>{Math.round(c.gain * 100)}%</output>
									</span>
									<input
										aria-label="Clip volume"
										type="range"
										min="0"
										max="100"
										value={c.gain * 100}
										onChange={(e) =>
											change("gain", Number(e.target.value) / 100)
										}
									/>
								</label>
							)}
							<h4>{c.kind === "audio" ? "Audio fades" : "Opacity fades"}</h4>
							<Numeric
								label="Fade in"
								value={c.fadeIn / SECOND}
								onChange={(v) => change("fadeIn", Math.round(v * SECOND))}
								min={0}
								max={c.duration / SECOND / 2}
								step={0.1}
								suffix="s"
							/>
							<Numeric
								label="Fade out"
								value={c.fadeOut / SECOND}
								onChange={(v) => change("fadeOut", Math.round(v * SECOND))}
								min={0}
								max={c.duration / SECOND / 2}
								step={0.1}
								suffix="s"
							/>
							<h4>Track assignment</h4>
							<select
								className="track-select"
								aria-label="Move to track"
								value={c.trackId}
								onChange={(e) => {
									const ids = [
										c.id,
										...editor.picked
											.filter((p) => p.id !== c.id)
											.map((p) => p.id),
									];
									const next = moveClips(editor.state, ids, 0, e.target.value);
									editor.commit(
										next,
										next === editor.state
											? "Track move blocked by a locked track or occupied space"
											: "Clips moved to track",
									);
								}}
							>
								{editor.state.tracks
									.filter((t) => (t.kind === "audio") === (c.kind === "audio"))
									.map((t) => (
										<option key={t.id} value={t.id}>
											{t.name}
											{t.locked ? " · locked" : ""}
										</option>
									))}
							</select>
							<details className="timing-details">
								<summary>Clip timing</summary>
								<div className="property">
									<span>Sequence start</span>
									<code>{time(c.start)}</code>
								</div>
								<div className="property">
									<span>Source offset</span>
									<code>{time(c.sourceIn)}</code>
								</div>
								<div className="property">
									<span>Duration</span>
									<code>{time(c.duration)}</code>
								</div>
							</details>
						</fieldset>
						{locked && (
							<p className="subtle">
								<LockKeyhole size={12} /> Unlock the track to edit.
							</p>
						)}
						<div className="clip-actions">
							<button
								type="button"
								disabled={locked}
								onClick={editor.duplicate}
							>
								<Copy size={13} /> Duplicate
							</button>
							{c.linkId && (
								<button type="button" disabled={locked} onClick={editor.unlink}>
									<Link2Off size={13} /> Unlink A/V
								</button>
							)}
							<button type="button" disabled={locked} onClick={editor.remove}>
								<Trash2 size={13} /> Delete
							</button>
						</div>
					</>
				) : (
					<div className="inspector-empty">
						<SlidersHorizontal size={24} />
						<h3>Select a clip</h3>
						<p>Adjust its transform, opacity, audio, or track assignment.</p>
						<small>Shift-click to select more than one.</small>
					</div>
				)}
			</div>
		</aside>
	);
}
