import type { MediaTimeUs } from "@/editor-core/model";

export type PreviewTransportRegionProps = {
	durationUs: MediaTimeUs;
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
	playheadUs: MediaTimeUs;
	selectionDurationUs: MediaTimeUs;
	selectionLoopEnabled: boolean;
	volume: number;
};
