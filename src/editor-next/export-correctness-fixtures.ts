import type { Selection } from "@/editor-core/model";

export type ExportCorrectnessFixture = {
	container: "mp4" | "webm";
	expected: {
		audioTrackCount: number;
		durationUs: number;
		mimeTypePrefix: string;
		videoTrackCount: number;
	};
	fileName: string;
	id: string;
	label: string;
	publicPath: string;
	selections: {
		full: Selection;
		selectedRange: Selection;
	};
};

const TWO_SECONDS_US = 2_000_000;

export const EXPORT_CORRECTNESS_FIXTURES = [
	{
		container: "mp4",
		expected: {
			audioTrackCount: 0,
			durationUs: TWO_SECONDS_US,
			mimeTypePrefix: "video/mp4",
			videoTrackCount: 1,
		},
		fileName: "tiny-video-only.mp4",
		id: "mp4-video-only",
		label: "Tiny MP4 video-only",
		publicPath: "/export-correctness-fixtures/tiny-video-only.mp4",
		selections: {
			full: {
				endUs: TWO_SECONDS_US,
				startUs: 0,
			},
			selectedRange: {
				endUs: 1_500_000,
				startUs: 500_000,
			},
		},
	},
	{
		container: "mp4",
		expected: {
			audioTrackCount: 1,
			durationUs: TWO_SECONDS_US,
			mimeTypePrefix: "video/mp4",
			videoTrackCount: 1,
		},
		fileName: "tiny-video-with-audio.mp4",
		id: "mp4-video-with-audio",
		label: "Tiny MP4 video with AAC audio",
		publicPath: "/export-correctness-fixtures/tiny-video-with-audio.mp4",
		selections: {
			full: {
				endUs: TWO_SECONDS_US,
				startUs: 0,
			},
			selectedRange: {
				endUs: 1_500_000,
				startUs: 500_000,
			},
		},
	},
	{
		container: "webm",
		expected: {
			audioTrackCount: 0,
			durationUs: TWO_SECONDS_US,
			mimeTypePrefix: "video/webm",
			videoTrackCount: 1,
		},
		fileName: "tiny-video-only.webm",
		id: "webm-video-only",
		label: "Tiny WebM video-only",
		publicPath: "/export-correctness-fixtures/tiny-video-only.webm",
		selections: {
			full: {
				endUs: TWO_SECONDS_US,
				startUs: 0,
			},
			selectedRange: {
				endUs: 1_500_000,
				startUs: 500_000,
			},
		},
	},
] satisfies ExportCorrectnessFixture[];
