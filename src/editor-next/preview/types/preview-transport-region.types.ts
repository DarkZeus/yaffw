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
