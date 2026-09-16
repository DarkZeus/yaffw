import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
} from "@/editor-core/model";
export const shellAsset: ReadyMediaAsset = {
	id: "nle-sequence",
	label: "S.T.A.L.K.E.R. — Patch 1.5.mp4",
	durationUs: 25_000_000,
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: false,
		reason: "Sequence rendering is outside this timeline prototype.",
	},
	frameTiming: { fps: 30, frameDurationUs: 33_333, source: "known" },
	provenance: {
		fileName: "S.T.A.L.K.E.R. — Patch 1.5.mp4",
		mimeType: "video/mp4",
		sizeBytes: 3865908,
	},
	tracks: {
		video: [
			{
				id: "v1",
				kind: "video",
				label: "Video",
				codec: "avc",
				width: 960,
				height: 540,
			},
		],
		audio: [
			{
				id: "a1",
				kind: "audio",
				label: "Production",
				codec: "aac",
				channels: 2,
				sampleRate: 48000,
			},
			{
				id: "a2",
				kind: "audio",
				label: "Score",
				codec: "pcm",
				channels: 1,
				sampleRate: 22050,
			},
			{
				id: "a3",
				kind: "audio",
				label: "Atmosphere",
				codec: "aac",
				channels: 2,
				sampleRate: 48000,
			},
		],
	},
};
