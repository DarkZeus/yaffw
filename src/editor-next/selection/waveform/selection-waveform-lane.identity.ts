import type { AudioMediaTrack } from "@/editor-core/model";
import type { WaveformLaneState } from "../types/selection-waveform-lanes.types";

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

export function createWaveformLaneIdentityViewModel({
	status,
	track,
	trackIndex,
}: WaveformLaneIdentityInput): WaveformLaneIdentityViewModel {
	const title = track.label?.trim() || `Unnamed audio lane ${trackIndex + 1}`;

	return {
		metadata: [
			formatTrackCodec(track.codec),
			formatTrackChannels(track.channels),
		],
		status: formatWaveformLaneStatus(status),
		title,
	};
}

function formatTrackCodec(codec: string | undefined) {
	const normalizedCodec = codec?.trim();

	if (!normalizedCodec) {
		return "Codec unknown";
	}

	return normalizedCodec.toUpperCase();
}

function formatTrackChannels(channels: number | undefined) {
	if (!channels || channels <= 0) {
		return "Channels unknown";
	}

	return channels === 1 ? "1 channel" : `${channels} channels`;
}

function formatWaveformLaneStatus(
	status: WaveformLaneState["status"],
): WaveformLaneIdentityViewModel["status"] {
	switch (status) {
		case "loading":
			return {
				label: "Loading waveform",
				tone: "pending",
			};
		case "ready":
			return {
				label: "Waveform ready",
				tone: "ready",
			};
		case "unavailable":
			return {
				label: "Waveform generation failed",
				tone: "unavailable",
			};
	}
}
