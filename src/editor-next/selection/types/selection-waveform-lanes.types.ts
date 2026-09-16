import type { AudioMediaTrack, MediaTimeUs } from "@/editor-core/model";

export type WaveformSamples = Float32Array | ReadonlyArray<number>;

export type WaveformLaneLoader = (
	request: WaveformLaneRequest,
) => Promise<WaveformLaneResult>;

export type WaveformLaneRequest = {
	assetDurationUs: MediaTimeUs;
	signal?: AbortSignal;
	source: Blob;
	track: AudioMediaTrack;
	trackIndex: number;
};

export type WaveformLaneResult =
	| {
			samples: WaveformSamples;
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
			samples: WaveformSamples;
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  }
);
