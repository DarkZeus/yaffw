import type { ReadyMediaAsset } from "@/editor-core/model";
/* @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaWindowProvider } from "../engine/media-window-provider";
import {
	type PreviewAudioResourcesResult,
	preparePreviewAudioResources,
} from "../engine/preview-audio-resources";
import {
	type UsePreviewAudioResourcesOptions,
	usePreviewAudioResources,
} from "../engine/use-preview-audio-resources";
vi.mock("../engine/preview-audio-resources", () => ({
	preparePreviewAudioResources: vi.fn(),
}));
const prepare = vi.mocked(preparePreviewAudioResources);
beforeEach(() => {
	prepare.mockReset();
});
afterEach(cleanup);
function prepared(): PreviewAudioResourcesResult {
	const provider: MediaWindowProvider = {
		dispose: vi.fn(async () => {}),
		durationSeconds: 12,
		getTrackMetadata: () => ({
			numberOfChannels: 2,
		}),
		openGeneration: vi.fn(),
		trackIds: readyAsset.tracks.audio.map((track) => track.id),
	};
	return {
		provider,
		resources: readyAsset.tracks.audio.map((track) => ({
			numberOfChannels: 2,
			trackId: track.id,
		})),
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}
const options = (): UsePreviewAudioResourcesOptions => ({
	asset: readyAsset,
	source,
	enabled: true,
});
describe("usePreviewAudioResources", () => {
	it("disposes a late provider without publishing after replacement", async () => {
		const first = deferred<PreviewAudioResourcesResult>();
		const stale = prepared();
		const second = prepared();
		prepare.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
		const hook = renderHook((props) => usePreviewAudioResources(props), {
			initialProps: options(),
		});
		const initialSignal = prepare.mock.calls[0][0].signal;
		hook.rerender({
			...options(),
			asset: { ...readyAsset, id: "replacement" },
		});
		expect(initialSignal.aborted).toBe(true);
		await waitFor(() =>
			expect(hook.result.current).toEqual({ status: "ready", ...second }),
		);
		await act(async () => first.resolve(stale));
		expect(stale.provider.dispose).toHaveBeenCalledOnce();
		expect(hook.result.current).toEqual({ status: "ready", ...second });
	});
	it("disposes a late provider after unmount", async () => {
		const pending = deferred<PreviewAudioResourcesResult>();
		const result = prepared();
		prepare.mockReturnValue(pending.promise);
		const hook = renderHook(() => usePreviewAudioResources(options()));
		hook.unmount();
		await act(async () => pending.resolve(result));
		expect(result.provider.dispose).toHaveBeenCalledOnce();
	});
});
const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

const readyAsset = {
	durationUs: 12_000_000,
	frameTiming: {
		analysis: {
			averageFrameRate: 30,
			frameRateIsConstant: true,
			maxFrameRate: 30,
			medianFrameRate: 30,
			minFrameRate: 30,
			probedPacketCount: 256,
			underlyingFrameRate: 30,
		},
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-1",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
	tracks: {
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
			{
				codec: "aac",
				id: "audio-2",
				kind: "audio",
				label: "Desktop",
			},
		],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;
