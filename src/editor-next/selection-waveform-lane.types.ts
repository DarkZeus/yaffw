import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";

import type { AudioMediaTrack } from "@/editor-core/model";

import type { WaveformLaneState } from "./selection-waveform-lanes.types";

export type WaveformLanePointerEvent =
	| ReactMouseEvent<HTMLButtonElement>
	| ReactPointerEvent<HTMLButtonElement>;

export type WaveformLaneProps = {
	lane: WaveformLaneState;
	onPointerDown: (event: WaveformLanePointerEvent) => void;
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
