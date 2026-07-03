import type { AudioCodec, Input, OutputFormat } from "mediabunny";

import type {
	AudioMediaTrack,
	AudioMix,
	AudioMixTrackDecision,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";
import type { DisposableMediaWorkScope } from "./disposable-media-work-scope";

export type PreviewAudioResource = {
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

export type PreviewAudioResourceFailure = {
	reason: string;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};

export type PreviewAudioResourcesResult = {
	failures: PreviewAudioResourceFailure[];
	resources: PreviewAudioResource[];
};

export type PreviewAudioResourcesRequest = {
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

export type PreviewAudioTrackResourceOptions = {
	assetTrack: AudioMediaTrack;
	createObjectURL: (blob: Blob) => string;
	metadata: AudioPreviewTrackMetadata;
	revokeObjectURL: (url: string) => void;
	signal: AbortSignal;
	scope: DisposableMediaWorkScope;
	track: InputAudioTrack;
	trackIndex: number;
};

export type PreparePreviewAudioTrackResourceOptions =
	PreviewAudioTrackResourceOptions & {
		decision: AudioMixTrackDecision | undefined;
		finalPeakGuardDb: number;
	};

export type PreparePreviewAudioTrackResourceResult =
	| {
			resource: PreviewAudioResource;
			status: "ready";
	  }
	| {
			reason: string;
			status: "failed";
	  };

export type CreateTransformedPreviewAudioTrackResourceOptions =
	PreviewAudioTrackResourceOptions & {
		channelMode: Exclude<AudioTrackChannelMode, "preserve">;
		finalPeakGuardDb: number;
	};

export type RemuxPreviewAudioTrackResourceOptions = PreviewAudioTrackResourceOptions & {
	candidate: RemuxCandidate;
};

export type CreatePreviewAudioResourceOptions = {
	assetTrack: AudioMediaTrack;
	blob: Blob;
	createObjectURL: (blob: Blob) => string;
	downloadName: string;
	metadata: AudioPreviewTrackMetadata;
	mimeType: string;
	revokeObjectURL: (url: string) => void;
	scope: DisposableMediaWorkScope;
	strategy: PreviewAudioResource["strategy"];
	trackIndex: number;
};
