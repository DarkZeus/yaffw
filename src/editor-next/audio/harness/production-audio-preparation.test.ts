import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
} from "@/editor-core/model";
import { afterEach, expect, it, vi } from "vitest";
import {
	type PreviewAudioEngine,
	createPreviewAudioEngine,
} from "../engine/preview-audio-engine";
import { preparePreviewAudioResources } from "../engine/preview-audio-resources";
import { prepareProductionAudioRun } from "./production-audio-evidence";

vi.mock("../engine/preview-audio-resources", () => ({
	preparePreviewAudioResources: vi.fn(),
}));
vi.mock("../engine/preview-audio-engine", async (importOriginal) => ({
	...(await importOriginal<typeof import("../engine/preview-audio-engine")>()),
	createPreviewAudioEngine: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

it("applies the production default audio mix before exposing a ready trial engine", async () => {
	vi.stubGlobal(
		"AudioContext",
		class {
			createBufferSource = vi.fn();
			close = vi.fn(async () => {});
			state = "suspended";
		},
	);
	const engine: PreviewAudioEngine = {
		destroy: vi.fn(),
		subscribe: vi.fn(),
		getMetrics: vi.fn(),
		retryTrack: vi.fn(),
		setPlaybackEnd: vi.fn(),
		getCurrentTime: vi.fn(),
		getStatus: () => "ready",
		pause: vi.fn(),
		play: vi.fn(),
		readMeterSnapshot: vi.fn(),
		setOutputGain: vi.fn(),
		setPlaybackRate: vi.fn(),
		setTime: vi.fn(),
		setTrackChannelMode: vi.fn(),
		setTrackMonitorGain: vi.fn(),
		setTrackVolumeGain: vi.fn(),
	};
	vi.mocked(createPreviewAudioEngine).mockResolvedValue(engine);
	vi.mocked(preparePreviewAudioResources).mockResolvedValue({
		failures: [],
		provider: {
			getTrackMetadata: vi.fn(),
			dispose: vi.fn(async () => {}),
			durationSeconds: 120,
			openGeneration: vi.fn(),
			trackIds: ["first", "second"],
		},
		resources: asset.tracks.audio.map((track, trackIndex) => ({
			track,
			trackId: track.id,
			trackIndex,
			numberOfChannels: 2,
			sampleRate: 48_000,
		})),
	});
	const run = await prepareProductionAudioRun(
		new File([], "fixture.mp4"),
		asset,
	);
	expect(run.engine).toBe(engine);
	expect(engine.play).not.toHaveBeenCalled();
	expect(engine.setOutputGain).toHaveBeenCalledWith(1);
	for (const index of [0, 1]) {
		expect(engine.setTrackMonitorGain).toHaveBeenCalledWith(index, 1);
		expect(engine.setTrackVolumeGain).toHaveBeenCalledWith(index, 1);
		expect(engine.setTrackChannelMode).toHaveBeenCalledWith(index, "preserve");
	}
	await run.cleanup();
});

const asset: ReadyMediaAsset = {
	durationUs: 120_000_000,
	exportCapability: { supported: true, profile: DEFAULT_OUTPUT_PROFILE },
	frameTiming: { source: "known", fps: 30, frameDurationUs: 33_333 },
	id: "fixture",
	label: "Fixture",
	provenance: { fileName: "fixture.mp4", sizeBytes: 0 },
	tracks: {
		video: [],
		audio: [
			{ id: "first", kind: "audio" },
			{ id: "second", kind: "audio" },
		],
	},
};
