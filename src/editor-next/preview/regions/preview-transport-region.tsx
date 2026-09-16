import {
	FastForward,
	Pause,
	Play,
	Repeat2,
	Rewind,
	SkipBack,
	SkipForward,
	TimerReset,
	Volume2,
	VolumeX,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { MediaTimeUs } from "@/editor-core/model";

export type PreviewTransportRegionProps = {
	isPlaying: boolean;
	muted: boolean;
	onPlaybackRateChange: (playbackRate: number) => void;
	onSeekByUs: (deltaUs: MediaTimeUs) => void;
	onStepFrame: (direction: -1 | 1) => void;
	onToggleMuted: () => void;
	onTogglePlayback: () => void | Promise<void>;
	onToggleSelectionLoop: () => void;
	onVolumeChange: (volume: number) => void;
	playbackRate: number;
	selectionLoopEnabled: boolean;
	volume: number;
};

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const PreviewTransportRegion = memo(function PreviewTransportRegion({
	isPlaying,
	muted,
	onPlaybackRateChange,
	onSeekByUs,
	onStepFrame,
	onToggleMuted,
	onTogglePlayback,
	onToggleSelectionLoop,
	onVolumeChange,
	playbackRate,
	selectionLoopEnabled,
	volume,
}: PreviewTransportRegionProps) {
	const [speedPointerFocus, setSpeedPointerFocus] = useState(false);

	function updatePlaybackRate(event: ChangeEvent<HTMLSelectElement>) {
		onPlaybackRateChange(Number.parseFloat(event.currentTarget.value));
	}

	function updateVolume(event: ChangeEvent<HTMLInputElement>) {
		onVolumeChange(Number.parseInt(event.currentTarget.value, 10) / 100);
	}

	return (
		<section aria-label="Workbench transport region">
			<div
				aria-label="Preview transport controls"
				className="cinema-transport-controls"
			>
				<div
					aria-label="Primary preview controls"
					className="flex min-w-0 flex-wrap items-center justify-start gap-1 md:flex-nowrap"
				>
					<Button
						aria-label={isPlaying ? "Pause" : "Play"}
						className="cinema-play-button"
						onClick={() => {
							void onTogglePlayback();
						}}
						size="icon"
						type="button"
					>
						{isPlaying ? (
							<Pause data-icon="inline-start" />
						) : (
							<Play data-icon="inline-start" />
						)}
					</Button>
					<PreviewIconButton
						label="Seek backward 10 seconds"
						onClick={() => onSeekByUs(-10_000_000)}
					>
						<Rewind data-icon="inline-start" />
					</PreviewIconButton>
					<PreviewIconButton
						label="Seek backward 1 second"
						onClick={() => onSeekByUs(-1_000_000)}
					>
						<SkipBack data-icon="inline-start" />
					</PreviewIconButton>
					<PreviewIconButton
						label="Step backward one frame"
						onClick={() => onStepFrame(-1)}
					>
						<SkipBack data-icon="inline-start" />
					</PreviewIconButton>
					<PreviewIconButton
						label="Step forward one frame"
						onClick={() => onStepFrame(1)}
					>
						<SkipForward data-icon="inline-start" />
					</PreviewIconButton>
					<PreviewIconButton
						label="Seek forward 1 second"
						onClick={() => onSeekByUs(1_000_000)}
					>
						<SkipForward data-icon="inline-start" />
					</PreviewIconButton>
					<PreviewIconButton
						label="Seek forward 10 seconds"
						onClick={() => onSeekByUs(10_000_000)}
					>
						<FastForward data-icon="inline-start" />
					</PreviewIconButton>
					<PreviewToggleButton
						label="Loop selection"
						onClick={onToggleSelectionLoop}
						pressed={selectionLoopEnabled}
					>
						<Repeat2 data-icon="inline-start" />
					</PreviewToggleButton>
				</div>

				<div
					aria-label="Preview playback settings"
					className="flex min-w-0 flex-wrap items-center justify-start gap-3 md:justify-end"
				>
					<label className="flex items-center gap-1">
						<Volume2 aria-hidden="true" className="size-3.5" />
						<span className="sr-only">Preview volume</span>
						<input
							aria-label="Preview volume"
							className="h-5 w-24 accent-primary"
							max="100"
							min="0"
							onChange={updateVolume}
							type="range"
							value={Math.round(volume * 100)}
						/>
					</label>
					<label className="flex items-center gap-1">
						<TimerReset aria-hidden="true" className="size-3.5" />
						<span className="sr-only">Playback speed</span>
						<select
							aria-label="Playback speed"
							className="h-7 rounded border-0 bg-workbench-hover px-2 text-xs shadow-none outline-none"
							data-pointer-focus={speedPointerFocus}
							onBlur={() => setSpeedPointerFocus(false)}
							onChange={updatePlaybackRate}
							onKeyDown={() => setSpeedPointerFocus(false)}
							onPointerDown={() => setSpeedPointerFocus(true)}
							value={String(playbackRate)}
						>
							{playbackSpeeds.map((speed) => (
								<option key={speed} value={speed}>
									{speed}x
								</option>
							))}
						</select>
					</label>

					<Button
						aria-label={muted ? "Unmute preview audio" : "Mute preview audio"}
						className="cinema-transport-button"
						onClick={onToggleMuted}
						size="icon"
						type="button"
						variant="outline"
					>
						{muted ? (
							<VolumeX data-icon="inline-start" />
						) : (
							<Volume2 data-icon="inline-start" />
						)}
					</Button>
				</div>
			</div>
		</section>
	);
});

function PreviewIconButton({
	children,
	label,
	onClick,
}: {
	children: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			aria-label={label}
			className="cinema-transport-button"
			onClick={onClick}
			size="icon"
			type="button"
			variant="outline"
		>
			{children}
		</Button>
	);
}

function PreviewToggleButton({
	children,
	label,
	onClick,
	pressed,
}: {
	children: ReactNode;
	label: string;
	onClick: () => void;
	pressed: boolean;
}) {
	return (
		<Button
			aria-label={label}
			aria-pressed={pressed}
			className="cinema-transport-button cinema-toggle-button"
			onClick={onClick}
			size="icon"
			title={label}
			type="button"
			variant="outline"
		>
			{children}
		</Button>
	);
}
