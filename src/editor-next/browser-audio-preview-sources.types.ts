import type { AudioCodec, Input, OutputFormat } from "mediabunny";

import type {
	AudioMediaTrack,
	AudioMix,
	AudioMixTrackDecision,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";
import type { DisposableMediaWorkScope } from "./disposable-media-work-scope";

export type BrowserAudioPreviewSource = {
	blob: Blob;
	byteLength: number;
	downloadName: string;
	mimeType: string;
	startPositionSeconds: number;
	strategy:
		| "decoded-channel-transform-aac-m4a"
		| "decoded-channel-transform-wav"
		| "decoded-wav-fallback"
		| "same-codec-remux";
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
	url: string;
};

export type BrowserAudioPreviewSourceFailure = {
	reason: string;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};

export type BrowserAudioPreviewSourcesResult = {
	failures: BrowserAudioPreviewSourceFailure[];
	sources: BrowserAudioPreviewSource[];
};

export type BrowserAudioPreviewSourcesRequest = {
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	createObjectURL?: (blob: Blob) => string;
	revokeObjectURL?: (url: string) => void;
	signal: AbortSignal;
	source: Blob;
	trackIds?: ReadonlySet<string>;
};

export type InputAudioTrack = Awaited<
	ReturnType<Input["getAudioTracks"]>
>[number];

export type AudioPreviewTrackMetadata = {
	codec: AudioCodec | null;
	firstTimestampSeconds: number | null;
	languageCode: string | null;
	name: string | null;
	number: number;
};

export type RemuxCandidate = {
	createFormat: () => OutputFormat;
	extension: string;
	label: string;
	mimeType: string;
};

export type AudioPreviewTrackSourceOptions = {
	assetTrack: AudioMediaTrack;
	createObjectURL: (blob: Blob) => string;
	metadata: AudioPreviewTrackMetadata;
	revokeObjectURL: (url: string) => void;
	signal: AbortSignal;
	scope: DisposableMediaWorkScope;
	track: InputAudioTrack;
	trackIndex: number;
};

export type PrepareAudioPreviewTrackSourceOptions =
	AudioPreviewTrackSourceOptions & {
		decision: AudioMixTrackDecision | undefined;
		finalPeakGuardDb: number;
	};

export type PrepareAudioPreviewTrackSourceResult =
	| {
			source: BrowserAudioPreviewSource;
			status: "ready";
	  }
	| {
			reason: string;
			status: "failed";
	  };

export type CreateTransformedAudioPreviewTrackSourceOptions =
	AudioPreviewTrackSourceOptions & {
		channelMode: Exclude<AudioTrackChannelMode, "preserve">;
		finalPeakGuardDb: number;
	};

export type RemuxAudioPreviewTrackOptions = AudioPreviewTrackSourceOptions & {
	candidate: RemuxCandidate;
};

export type CreateAudioPreviewSourceOptions = {
	assetTrack: AudioMediaTrack;
	blob: Blob;
	createObjectURL: (blob: Blob) => string;
	downloadName: string;
	metadata: AudioPreviewTrackMetadata;
	mimeType: string;
	revokeObjectURL: (url: string) => void;
	scope: DisposableMediaWorkScope;
	strategy: BrowserAudioPreviewSource["strategy"];
	trackIndex: number;
};
