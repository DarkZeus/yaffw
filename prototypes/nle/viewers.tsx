import { useEffect, useRef } from "react";
import { type Asset, type Clip, SECOND, clamp, end } from "./model";
import type { Editor } from "./use-editor";
function MediaLayer({
	clip,
	asset,
	editor,
	audio = false,
	gain = 1,
}: {
	clip: Clip;
	asset: Asset;
	editor: Editor;
	audio?: boolean;
	gain?: number;
}) {
	const media = useRef<HTMLVideoElement>(null);
	const at = (clip.sourceIn + editor.playhead - clip.start) / SECOND;
	useEffect(() => {
		const el = media.current;
		if (!el) return;
		el.volume = clamp(clip.gain * gain * editor.masterGain, 0, 1);
		el.playbackRate = editor.speed;
		function sync() {
			if (!el) return;
			if (Math.abs(el.currentTime - at) > (editor.playing ? 0.16 : 0.01))
				el.currentTime = Math.max(0, at);
			if (editor.playing && el.paused)
				void el.play().catch((error: unknown) => {
					if (error instanceof DOMException && error.name === "AbortError")
						return;
					editor.setPlaying(false);
					editor.setMessage("Playback could not start. Press Play to retry.");
				});
			if (!editor.playing && !el.paused) el.pause();
		}
		if (el.readyState >= 2) sync();
		el.addEventListener("loadeddata", sync);
		return () => el.removeEventListener("loadeddata", sync);
	}, [
		at,
		editor.playing,
		editor.speed,
		clip.gain,
		editor.masterGain,
		gain,
		editor.setPlaying,
		editor.setMessage,
	]);
	return (
		<video
			ref={media}
			className={audio ? "audio-renderer" : "layer-media"}
			src={asset.url}
			poster={audio ? undefined : asset.poster}
			muted={!audio || editor.muted}
			preload="auto"
			playsInline
			aria-label={audio ? `Audio ${clip.name}` : `Video ${clip.name}`}
			onError={() => {
				editor.setPlaying(false);
				editor.setMessage(`Cannot decode ${asset.name}`);
			}}
		/>
	);
}
export function ProgramMonitor({ editor }: { editor: Editor }) {
	const at = Math.min(editor.playhead, Math.max(0, editor.total - 1));
	const visual = editor.state.tracks
		.filter((t) => t.kind === "video" && !t.hidden)
		.reverse()
		.flatMap((t) =>
			editor.state.clips.filter(
				(c) => c.trackId === t.id && c.start <= at && end(c) > at,
			),
		);
	const audioTracks = editor.state.tracks.filter((t) => t.kind === "audio");
	const hasSolo = audioTracks.some((t) => t.solo);
	const sounds = audioTracks
		.filter((t) => !t.muted && (!hasSolo || t.solo))
		.flatMap((t) =>
			editor.state.clips
				.filter((c) => c.trackId === t.id && c.start <= at && end(c) > at)
				.map((c) => ({ clip: c, gain: t.gain })),
		);
	return (
		<section className="program-monitor panel">
			<div className="panel-header">
				<strong>
					Program <span>{editor.state.name}</span>
				</strong>
				<small>1920 × 1080 · 30 fps</small>
			</div>
			<div className="program-room">
				<div className="program-stage">
					{visual.length === 0 && (
						<div className="program-empty">No picture at playhead</div>
					)}
					{visual.map((clip) => {
						const asset = editor.assets.find((a) => a.id === clip.assetId);
						if (!asset) return null;
						const fade = Math.min(
							clip.fadeIn ? clamp((at - clip.start) / clip.fadeIn, 0, 1) : 1,
							clip.fadeOut ? clamp((end(clip) - at) / clip.fadeOut, 0, 1) : 1,
						);
						return (
							<div
								key={clip.id}
								className={`composition-layer ${clip.kind === "title" ? "title-layer" : ""}`}
								style={{
									transform: `translate(${clip.x}%,${clip.y}%) scale(${clip.scale})`,
									opacity: clip.opacity * fade,
								}}
							>
								{clip.kind === "title" ? (
									<span
										className="composed-title"
										style={{ color: clip.color }}
									>
										{clip.text}
									</span>
								) : clip.kind === "image" ? (
									<img className="layer-media" src={asset.url} alt="" />
								) : (
									<MediaLayer clip={clip} asset={asset} editor={editor} />
								)}
							</div>
						);
					})}
					{sounds.map(({ clip, gain }) => {
						const asset = editor.assets.find((a) => a.id === clip.assetId);
						const fade = Math.min(
							clip.fadeIn ? clamp((at - clip.start) / clip.fadeIn, 0, 1) : 1,
							clip.fadeOut ? clamp((end(clip) - at) / clip.fadeOut, 0, 1) : 1,
						);
						return asset ? (
							<MediaLayer
								key={clip.id}
								clip={clip}
								asset={asset}
								editor={editor}
								audio
								gain={gain * fade}
							/>
						) : null;
					})}
				</div>
			</div>
		</section>
	);
}
