import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";

import type {
	AudioMediaTrack,
	AudioMixTrackDecision,
	AudioTrackChannelMode,
	MediaTimeUs,
	Selection,
} from "@/editor-core/model";

import type { WaveformLaneState } from "./selection-waveform-lanes.types";
import type { WaveformRegionSelectionChange } from "./selection-waveform-surface.types";

export type WaveformLanePointerEvent =
	| ReactMouseEvent<HTMLButtonElement>
	| ReactPointerEvent<HTMLButtonElement>;

export type WaveformLaneProps = {
	audioDecision?: AudioMixTrackDecision;
	audioPreviewPreparing: boolean;
	durationUs: MediaTimeUs;
	lane: WaveformLaneState;
	laneHeaderWidthPx: number;
	minimumSelectionDurationUs: MediaTimeUs;
	onAudioTrackChannelModeChange?: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onAudioTrackVolumePercentChange?: (
		trackId: string,
		volumePercent: number,
	) => void;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onPointerDown: (event: WaveformLanePointerEvent) => void;
	onSelectionCommitRequested: (change: WaveformRegionSelectionChange) => void;
	onSelectionPreviewRequested: (change: WaveformRegionSelectionChange) => void;
	selection: Selection;
	selectionEditingDisabled: boolean;
	selectionEditInProgress: boolean;
	onSoloedAudioTrackChange?: (trackId: string | null) => void;
	soloedAudioTrackId?: string | null;
	trackIndex: number;
};

export type WaveformLaneIdentityInput = {
	status: WaveformLaneState["status"];
	track: AudioMediaTrack;
	trackIndex: number;
};

export type WaveformLaneIdentityStatusTone =
	| "pending"
	| "ready"
	| "unavailable";

export type WaveformLaneIdentityViewModel = {
	metadata: string[];
	status: {
		label: string;
		tone: WaveformLaneIdentityStatusTone;
	};
	title: string;
};
