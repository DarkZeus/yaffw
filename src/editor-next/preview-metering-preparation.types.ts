import type { AudioMediaTrack, ReadyMediaAsset } from "@/editor-core/model";

export type PreviewMeteringPreparedTrack = {
	audioBuffer: AudioBuffer;
	channelLabels: string[];
	startPositionSeconds: number;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};

export type PreviewMeteringPreparationFailure = {
	reason: string;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};

export type PreviewMeteringPreparationResult = {
	failures: PreviewMeteringPreparationFailure[];
	tracks: PreviewMeteringPreparedTrack[];
};

export type PreviewMeteringPreparationRequest = {
	asset: ReadyMediaAsset;
	signal: AbortSignal;
	source: Blob;
	trackIds?: ReadonlySet<string>;
};

export type PreviewMeteringTrackState =
	| {
			status: "preparing";
			trackId: string;
	  }
	| {
			prepared: PreviewMeteringPreparedTrack;
			status: "ready";
			trackId: string;
	  }
	| {
			reason: string;
			status: "unavailable";
			trackId: string;
	  };

export type PreviewMeteringTrackStates = Record<
	string,
	PreviewMeteringTrackState
>;
