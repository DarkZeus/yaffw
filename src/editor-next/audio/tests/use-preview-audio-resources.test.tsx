import type { ReadyMediaAsset } from "@/editor-core/model";
/* @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActiveMediaAssetCleanupScopeController } from "../../media-work/scopes/active-media-asset-cleanup-scope";
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
			failureReason: null,
			numberOfChannels: 2,
			sampleRate: 48_000,
		}),
		openGeneration: vi.fn(),
		trackIds: readyAsset.tracks.audio.map((track) => track.id),
	};
	return {
		provider,
		failures: [],
		resources: readyAsset.tracks.audio.map((track, trackIndex) => ({
			numberOfChannels: 2,
			sampleRate: 48_000,
			track,
			trackIndex,
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
	it("does not create preview audio ownership for a video-only asset", () => {
		const hook = renderHook(() =>
			usePreviewAudioResources({
				...options(),
				asset: { ...readyAsset, tracks: { ...readyAsset.tracks, audio: [] } },
			}),
		);
		expect(hook.result.current.status).toBe("disabled");
		expect(prepare).not.toHaveBeenCalled();
	});

	it("owns one provider across equivalent asset rerenders and disposes once on unmount", async () => {
		const result = prepared();
		prepare.mockResolvedValue(result);
		const hook = renderHook((props) => usePreviewAudioResources(props), {
			initialProps: options(),
		});
		await waitFor(() => expect(hook.result.current.status).toBe("ready"));
		hook.rerender({ ...options(), asset: { ...readyAsset } });
		expect(prepare).toHaveBeenCalledOnce();
		expect(result.provider.openGeneration).not.toHaveBeenCalled();
		expect(result.provider.dispose).not.toHaveBeenCalled();
		hook.unmount();
		expect(result.provider.dispose).toHaveBeenCalledOnce();
	});
	it("publishes failed metadata with the provider so the engine owns isolated retry", async () => {
		const result = prepared();
		result.failures = result.resources.map((resource) => ({
			reason: "unsupported codec",
			track: resource.track,
			trackId: resource.trackId,
			trackIndex: resource.trackIndex,
		}));
		prepare.mockResolvedValue(result);
		const hook = renderHook(() => usePreviewAudioResources(options()));
		await waitFor(() =>
			expect(hook.result.current).toEqual({ status: "ready", ...result }),
		);
	});
	it("releases the provider on disable and opens fresh ownership when re-enabled", async () => {
		const first = prepared();
		const second = prepared();
		prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const hook = renderHook((props) => usePreviewAudioResources(props), {
			initialProps: options(),
		});
		await waitFor(() => expect(hook.result.current.status).toBe("ready"));
		hook.rerender({ ...options(), enabled: false });
		expect(first.provider.dispose).toHaveBeenCalledOnce();
		expect(hook.result.current.status).toBe("disabled");
		hook.rerender(options());
		await waitFor(() =>
			expect(hook.result.current).toEqual({ status: "ready", ...second }),
		);
	});
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
	it("aborts and disposes when the active asset cleanup scope closes", async () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const scope = controller.replaceCurrentScope(readyAsset.id);
		const result = prepared();
		prepare.mockResolvedValue(result);
		const hook = renderHook(() =>
			usePreviewAudioResources({
				...options(),
				activeMediaAssetCleanupScope: scope,
			}),
		);
		await waitFor(() => expect(hook.result.current.status).toBe("ready"));
		act(() => controller.disposeCurrentScope());
		expect(prepare.mock.calls[0][0].signal.aborted).toBe(true);
		expect(result.provider.dispose).toHaveBeenCalledOnce();
		hook.unmount();
		expect(result.provider.dispose).toHaveBeenCalledOnce();
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
	it("reports source-open failures explicitly", async () => {
		prepare.mockRejectedValue(new Error("source unavailable"));
		const hook = renderHook(() => usePreviewAudioResources(options()));
		await waitFor(() => expect(hook.result.current.status).toBe("failed"));
		expect(hook.result.current).toEqual(
			expect.objectContaining({
				reason: "source unavailable",
				failures: expect.arrayContaining([
					expect.objectContaining({ trackId: "audio-1" }),
				]),
			}),
		);
	});
	it("reports an asynchronous provider cleanup failure on release", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const result = prepared();
			const failure = new Error("iterator cleanup failed");
			vi.mocked(result.provider.dispose).mockRejectedValue(failure);
			prepare.mockResolvedValue(result);
			const hook = renderHook(() => usePreviewAudioResources(options()));
			await waitFor(() => expect(hook.result.current.status).toBe("ready"));
			hook.unmount();
			await waitFor(() =>
				expect(log).toHaveBeenCalledWith(
					"Preview audio provider cleanup failed.",
					failure,
				),
			);
			expect(result.provider.dispose).toHaveBeenCalledOnce();
		} finally {
			log.mockRestore();
		}
	});
});
const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: {
			audioCodec: "aac",
			container: "mp4",
			videoCodec: "h264",
		},
		supported: true,
	},
	frameTiming: {
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
