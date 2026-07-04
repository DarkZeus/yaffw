import type { Selection } from "@/editor-core/model";

export type SyncFlashClickEvent = {
	audioClickUs: number;
	visualFlashUs: number;
};

export type PreviewSyncRegressionScenario =
	| "audio-mix-changes"
	| "play-pause-seek-frame-step"
	| "selection-loop";

export type ExportCorrectnessFixture = {
	container: "mp4" | "webm";
	expected: {
		audioTrackCount: number;
		durationUs: number;
		mimeTypePrefix: string;
		syncEventDurationUs?: number;
		syncEventsUs?: SyncFlashClickEvent[];
		videoTrackCount: number;
	};
	fileName: string;
	id: string;
	label: string;
	previewSync?: {
		eventDurationUs: number;
		eventsUs: SyncFlashClickEvent[];
		manualQaDocumentPath: string;
		regressionScenarios: PreviewSyncRegressionScenario[];
	};
	publicPath: string;
	selections: {
		full: Selection;
		selectedRange: Selection;
	};
};

const TWO_SECONDS_US = 2_000_000;
const TEN_SECONDS_US = 10_000_000;
const SYNC_FLASH_CLICK_EVENT_DURATION_US = 100_000;
const SYNC_FLASH_CLICK_EVENTS_US = [
	{
		audioClickUs: 1_000_000,
		visualFlashUs: 1_000_000,
	},
	{
		audioClickUs: 2_000_000,
		visualFlashUs: 2_000_000,
	},
	{
		audioClickUs: 3_000_000,
		visualFlashUs: 3_000_000,
	},
	{
		audioClickUs: 4_000_000,
		visualFlashUs: 4_000_000,
	},
	{
		audioClickUs: 5_000_000,
		visualFlashUs: 5_000_000,
	},
	{
		audioClickUs: 6_000_000,
		visualFlashUs: 6_000_000,
	},
	{
		audioClickUs: 7_000_000,
		visualFlashUs: 7_000_000,
	},
	{
		audioClickUs: 8_000_000,
		visualFlashUs: 8_000_000,
	},
	{
		audioClickUs: 9_000_000,
		visualFlashUs: 9_000_000,
	},
];

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
	{
		container: "mp4",
		expected: {
			audioTrackCount: 1,
			durationUs: TEN_SECONDS_US,
			mimeTypePrefix: "video/mp4",
			syncEventDurationUs: SYNC_FLASH_CLICK_EVENT_DURATION_US,
			syncEventsUs: SYNC_FLASH_CLICK_EVENTS_US,
			videoTrackCount: 1,
		},
		fileName: "sync-flash-click.mp4",
		id: "mp4-sync-flash-click",
		label: "Sync flash/click MP4",
		previewSync: {
			eventDurationUs: SYNC_FLASH_CLICK_EVENT_DURATION_US,
			eventsUs: SYNC_FLASH_CLICK_EVENTS_US,
			manualQaDocumentPath: "docs/preview-sync-regression.md",
			regressionScenarios: [
				"play-pause-seek-frame-step",
				"selection-loop",
				"audio-mix-changes",
			],
		},
		publicPath: "/export-correctness-fixtures/sync-flash-click.mp4",
		selections: {
			full: {
				endUs: TEN_SECONDS_US,
				startUs: 0,
			},
			selectedRange: {
				endUs: 8_000_000,
				startUs: 2_000_000,
			},
		},
	},
] satisfies ExportCorrectnessFixture[];
