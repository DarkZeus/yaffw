import { useEffect, useRef } from "react";
import { type Track, clamp } from "./model";

const MIN_HEIGHT = 28;
const MAX_HEIGHT = 180;
export const defaultTrackHeight = (track: Track) =>
	track.kind === "audio" ? 40 : 48;

export function TrackResizeHandle({
	track,
	height,
	onHeightChange,
}: {
	track: Track;
	height: number;
	onHeightChange: (height: number) => void;
}) {
	const drag = useRef<{ y: number; height: number } | null>(null);
	const setHeight = (value: number) =>
		onHeightChange(clamp(Math.round(value), MIN_HEIGHT, MAX_HEIGHT));
	const cancel = () => {
		if (drag.current) setHeight(drag.current.height);
		drag.current = null;
	};
	useEffect(() => {
		function cancelDrag(event: KeyboardEvent) {
			if (event.key !== "Escape" || !drag.current) return;
			event.preventDefault();
			event.stopPropagation();
			onHeightChange(drag.current.height);
			drag.current = null;
		}
		window.addEventListener("keydown", cancelDrag, true);
		return () => window.removeEventListener("keydown", cancelDrag, true);
	}, [onHeightChange]);
	return (
		<div
			className="track-height-handle"
			role="separator"
			tabIndex={0}
			aria-label={`Resize ${track.name} track from bottom`}
			aria-orientation="horizontal"
			aria-valuemin={MIN_HEIGHT}
			aria-valuemax={MAX_HEIGHT}
			aria-valuenow={height}
			title="Drag to resize track · Double-click to reset"
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = { y: e.clientY, height };
			}}
			onPointerMove={(e) => {
				if (drag.current)
					setHeight(drag.current.height + e.clientY - drag.current.y);
			}}
			onPointerUp={() => {
				drag.current = null;
			}}
			onLostPointerCapture={() => {
				drag.current = null;
			}}
			onPointerCancel={cancel}
			onDoubleClick={() => setHeight(defaultTrackHeight(track))}
			onKeyDown={(e) => {
				if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
					e.preventDefault();
					e.stopPropagation();
					if (e.key === "Home") setHeight(MIN_HEIGHT);
					else if (e.key === "End") setHeight(MAX_HEIGHT);
					else
						setHeight(
							height + (e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 20 : 4),
						);
				}
			}}
		/>
	);
}
