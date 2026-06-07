import type { AudioMediaTrack, MediaTimeUs } from "@/editor-core/model";

export type WaveformLaneLoader = (
	request: WaveformLaneRequest,
) => Promise<WaveformLaneResult>;

export type WaveformLaneRequest = {
	assetDurationUs: MediaTimeUs;
	source: Blob;
	track: AudioMediaTrack;
	trackIndex: number;
};

export type WaveformLaneResult =
	| {
			samples: number[];
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  };

export type WaveformLaneState = {
	track: AudioMediaTrack;
} & (
	| {
			status: "loading";
	  }
	| {
			samples: number[];
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  }
);
