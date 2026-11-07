/* @vitest-environment jsdom */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import type { GeneratedMedia, OutputSettings } from "@/editor-core/model";
import { createDefaultOutputSettings } from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import { useSingleAssetEditingSession } from "../session/use-single-asset-editing-session";
import type { SingleAssetEditingSession } from "../session/use-single-asset-editing-session";

afterEach(() => {
	cleanup();
});

describe("useSingleAssetEditingSession", () => {
	it("ignores stale successful Media asset analysis after confirmed Close file and re-import", async () => {
		const inspections: Array<{
			deferred: Deferred<LocalMediaAssetInspection>;
			fileName: string;
		}> = [];
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};
		let assetId = 0;
		let draftId = 0;

		render(
			<SingleAssetEditingSessionProbe
				createAssetId={() => `asset-${++assetId}`}
				createDraftId={() => `draft-${++draftId}`}
				inspectLocalAsset={(draft) => {
					const deferred = createDeferred<LocalMediaAssetInspection>();
					inspections.push({
						deferred,
						fileName: draft.provenance.fileName,
					});

					return deferred.promise;
				}}
				sessionRef={sessionRef}
			/>,
		);

		let firstImport: Promise<void> | undefined;
		let secondImport: Promise<void> | undefined;

		act(() => {
			firstImport = sessionRef.current?.commands.importLocalFile(
				new File(["first video"], "first.mp4", { type: "video/mp4" }),
			);
			secondImport = sessionRef.current?.commands.importLocalFile(
				new File(["second video"], "second.mp4", { type: "video/mp4" }),
			);
		});

		await waitFor(() => {
			expect(inspections.map((inspection) => inspection.fileName)).toEqual([
				"first.mp4",
				"second.mp4",
			]);
		});
		expect(sessionRef.current?.session).toMatchObject({
			draft: { label: "second.mp4" },
			status: "loading",
		});

		await act(async () => {
			inspections[1]?.deferred.resolve(supportedInspection);
			await secondImport;
		});

		await waitFor(() => {
			const session = sessionRef.current?.session;
			expect(session?.status).toBe("ready");
			if (session?.status !== "ready") {
				return;
			}
			expect(session.asset.label).toBe("second.mp4");
		});

		const previousPreview = sessionRef.current?.preview;
		act(() => {
			sessionRef.current?.commands.requestCloseFile();
		});
		expect(previousPreview?.cleanupScope.isCurrent()).toBe(false);
		expect(sessionRef.current?.preview).toBeNull();

		let reopened: Promise<void> | undefined;
		act(() => {
			if (!previousPreview) throw new Error("Expected Preview resources.");
			reopened = sessionRef.current?.commands.importLocalFile(
				previousPreview.source,
			);
		});
		await act(async () => {
			inspections[2]?.deferred.resolve(supportedInspection);
			await reopened;
		});
		const reopenedPreview = sessionRef.current?.preview;
		expect(reopenedPreview?.source).toBe(previousPreview?.source);
		expect(reopenedPreview?.cleanupScope).not.toBe(
			previousPreview?.cleanupScope,
		);

		await act(async () => {
			inspections[0]?.deferred.resolve({
				...supportedInspection,
			});
			await firstImport;
		});

		await waitFor(() => {
			const session = sessionRef.current?.session;
			expect(session?.status).toBe("ready");
			if (session?.status !== "ready") {
				return;
			}
			expect(session.asset.label).toBe("second.mp4");
			expect(sessionRef.current?.preview).toBe(reopenedPreview);
			expect(reopenedPreview?.cleanupScope.isCurrent()).toBe(true);
			expect(sessionRef.current?.preview?.cleanupScope?.assetId).toBe(
				session.asset.id,
			);
		});
	});

	it("ignores an old import command while a newer Media asset is ready", async () => {
		const inspect = vi.fn(async () => supportedInspection);
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};
		render(
			<SingleAssetEditingSessionProbe
				inspectLocalAsset={inspect}
				sessionRef={sessionRef}
			/>,
		);
		const emptyCommands = sessionRef.current?.commands;
		const source = new File(["video"], "keep.mp4", { type: "video/mp4" });
		await act(async () => {
			await emptyCommands?.importLocalFile(source);
		});
		const scope = sessionRef.current?.preview?.cleanupScope;
		await act(async () => {
			await emptyCommands?.importLocalFile(
				new File(["stale"], "stale.mp4", { type: "video/mp4" }),
			);
		});
		expect(inspect).toHaveBeenCalledTimes(1);
		expect(scope?.isCurrent()).toBe(true);
		expect(sessionRef.current?.preview?.source).toBe(source);
		expect(sessionRef.current?.session).toMatchObject({
			asset: { label: "keep.mp4" },
			status: "ready",
		});
	});

	it("ignores stale failed Media asset analysis after a newer Media asset is ready", async () => {
		const inspections: Deferred<LocalMediaAssetInspection>[] = [];
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};

		render(
			<SingleAssetEditingSessionProbe
				inspectLocalAsset={() => {
					const deferred = createDeferred<LocalMediaAssetInspection>();
					inspections.push(deferred);

					return deferred.promise;
				}}
				sessionRef={sessionRef}
			/>,
		);

		let firstImport: Promise<void> | undefined;
		let secondImport: Promise<void> | undefined;
		act(() => {
			firstImport = sessionRef.current?.commands.importLocalFile(
				new File(["first video"], "first.mp4", { type: "video/mp4" }),
			);
			secondImport = sessionRef.current?.commands.importLocalFile(
				new File(["second video"], "second.mp4", { type: "video/mp4" }),
			);
		});

		await waitFor(() => {
			expect(inspections).toHaveLength(2);
		});
		await act(async () => {
			inspections[1]?.resolve(supportedInspection);
			await secondImport;
		});

		const readyAssetId = sessionRef.current?.preview?.cleanupScope?.assetId;
		await act(async () => {
			inspections[0]?.reject(new Error("First analysis failed late."));
			await firstImport;
		});

		expect(sessionRef.current?.session).toMatchObject({
			asset: { label: "second.mp4" },
			status: "ready",
		});
		expect(sessionRef.current?.preview?.source).toMatchObject({
			name: "second.mp4",
		});
		expect(sessionRef.current?.preview?.cleanupScope?.assetId).toBe(
			readyAssetId,
		);
	});

	it("aborts pending Media asset analysis and suppresses its completion after unmount", async () => {
		const inspection = createDeferred<LocalMediaAssetInspection>();
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};
		let analysisSignal: AbortSignal | undefined;
		const view = render(
			<SingleAssetEditingSessionProbe
				inspectLocalAsset={(_draft, request) => {
					analysisSignal = request.signal;

					return inspection.promise;
				}}
				sessionRef={sessionRef}
			/>,
		);

		let pendingImport: Promise<void> | undefined;
		act(() => {
			pendingImport = sessionRef.current?.commands.importLocalFile(
				new File(["video"], "pending.mp4", { type: "video/mp4" }),
			);
		});
		await waitFor(() => {
			expect(analysisSignal).toBeInstanceOf(AbortSignal);
		});

		view.unmount();
		expect(analysisSignal?.aborted).toBe(true);
		await act(async () => {
			inspection.resolve(supportedInspection);
			await pendingImport;
		});
		expect(sessionRef.current?.session.status).toBe("loading");
	});

	it("keeps rejected decisions deliverable and invalidates accepted changes before React renders", async () => {
		const deliverGeneratedMedia = vi.fn(() => true);
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};
		render(
			<SingleAssetEditingSessionProbe
				deliverGeneratedMedia={deliverGeneratedMedia}
				sessionRef={sessionRef}
			/>,
		);
		await act(async () => {
			await sessionRef.current?.commands.importLocalFile(
				new File(["video"], "clip.mp4", { type: "video/mp4" }),
			);
		});
		await act(async () => {
			const commands = sessionRef.current?.commands;
			const exportJob = commands?.startDefaultExport();
			expect(commands?.applyOutputSettings(downscaledOutputSettings())).toBe(
				false,
			);
			await exportJob;
		});
		const generatedMedia = readGeneratedMedia(sessionRef.current);
		const commands = sessionRef.current?.commands;
		act(() => {
			commands?.setAudioTrackIncluded("unknown-track", false);
			commands?.applyOutputSettings(createDefaultOutputSettings());
			commands?.downloadGeneratedMedia(generatedMedia);
		});
		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);
		act(() => {
			commands?.setAudioTrackIncluded("audio-1", false);
			commands?.downloadGeneratedMedia(generatedMedia);
		});
		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);
		expect(sessionRef.current?.session).toMatchObject({
			export: { status: "reviewing" },
		});
	});

	it("invalidates retained Generated media blobs when changed Output settings are applied", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const deliverGeneratedMedia = vi.fn(() => true);
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};

		render(
			<SingleAssetEditingSessionProbe
				deliverGeneratedMedia={deliverGeneratedMedia}
				generatedBlob={generatedBlob}
				sessionRef={sessionRef}
			/>,
		);

		await act(async () => {
			await sessionRef.current?.commands.importLocalFile(
				new File(["video"], "clip.mp4", { type: "video/mp4" }),
			);
		});
		await waitFor(() => {
			expect(sessionRef.current?.session.status).toBe("ready");
		});

		await act(async () => {
			await sessionRef.current?.commands.startDefaultExport();
		});
		await waitFor(() => {
			const session = sessionRef.current?.session;
			expect(session?.status).toBe("ready");
			if (session?.status !== "ready") {
				return;
			}
			expect(session.export.status).toBe("succeeded");
		});

		const generatedMedia = readGeneratedMedia(sessionRef.current);

		act(() => {
			const commands = sessionRef.current?.commands;
			expect(
				commands?.applyOutputSettings({
					...createDefaultOutputSettings(),
					videoQuality: { kind: "custom-bitrate", bitrateBps: 0 },
				}),
			).toBe(false);
			expect(commands?.applyOutputSettings(createDefaultOutputSettings())).toBe(
				true,
			);
			sessionRef.current?.commands.downloadGeneratedMedia(generatedMedia);
		});
		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);

		act(() => {
			sessionRef.current?.commands.applyOutputSettings(
				downscaledOutputSettings(),
			);
		});
		await waitFor(() => {
			const session = sessionRef.current?.session;
			expect(session?.status).toBe("ready");
			if (session?.status !== "ready") {
				return;
			}
			expect(session.outputSettings).toEqual(downscaledOutputSettings());
			expect(session.export.status).toBe("reviewing");
		});

		act(() => {
			sessionRef.current?.commands.downloadGeneratedMedia(generatedMedia);
		});

		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);
	});

	it("releases a replaced artifact and only delivers the current result after an acknowledged handoff", async () => {
		const firstBlob = new Blob(["first"]);
		const secondBlob = new Blob(["second"]);
		const replacement = createDeferred<{ blob: Blob }>();
		const run = vi
			.fn()
			.mockResolvedValueOnce({ blob: firstBlob })
			.mockReturnValueOnce(replacement.promise);
		const deliverGeneratedMedia = vi
			.fn()
			.mockReturnValueOnce(false)
			.mockReturnValue(true);
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};
		render(
			<SingleAssetEditingSessionProbe
				defaultExportRunner={{ cancelSupported: true, run }}
				deliverGeneratedMedia={deliverGeneratedMedia}
				sessionRef={sessionRef}
			/>,
		);
		await act(async () => {
			await sessionRef.current?.commands.importLocalFile(
				new File(["video"], "clip.mp4", { type: "video/mp4" }),
			);
		});
		await act(async () => {
			await sessionRef.current?.commands.startDefaultExport();
		});
		const first = readGeneratedMedia(sessionRef.current);
		act(() => {
			expect(sessionRef.current?.commands.downloadGeneratedMedia(first)).toBe(
				false,
			);
		});
		expect(sessionRef.current?.session).toMatchObject({
			export: { status: "succeeded", delivered: false },
		});
		act(() => {
			expect(sessionRef.current?.commands.downloadGeneratedMedia(first)).toBe(
				true,
			);
		});
		expect(sessionRef.current?.session).toMatchObject({
			export: { status: "succeeded", delivered: true },
		});

		await act(async () => {
			const commands = sessionRef.current?.commands;
			const pending = commands?.startDefaultExport();
			await commands?.startDefaultExport();
			commands?.downloadGeneratedMedia(first);
			expect(run).toHaveBeenCalledTimes(2);
			expect(deliverGeneratedMedia).toHaveBeenCalledTimes(2);
			replacement.resolve({ blob: secondBlob });
			await pending;
		});
		const second = readGeneratedMedia(sessionRef.current);
		expect(second.id).toBe(first.id);
		act(() => {
			expect(sessionRef.current?.commands.downloadGeneratedMedia(first)).toBe(
				false,
			);
		});
		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(2);
		act(() => {
			expect(sessionRef.current?.commands.downloadGeneratedMedia(second)).toBe(
				true,
			);
		});
		expect(deliverGeneratedMedia).toHaveBeenLastCalledWith({
			blob: secondBlob,
			generatedMedia: second,
		});
		expect(sessionRef.current?.session).toMatchObject({
			export: { status: "succeeded", delivered: true },
		});
	});
});

function SingleAssetEditingSessionProbe({
	confirmCloseFile = () => true,
	createAssetId = () => "asset-1",
	createDraftId = () => "draft-1",
	createExportJobId = () => "export-1",
	createGeneratedMediaId = () => "generated-1",
	defaultExportRunner,
	deliverGeneratedMedia = () => true,
	generatedBlob,
	inspectLocalAsset = async () => supportedInspection,
	sessionRef,
}: {
	confirmCloseFile?: SingleAssetEditingSessionOptions["confirmCloseFile"];
	createAssetId?: SingleAssetEditingSessionOptions["createAssetId"];
	createDraftId?: SingleAssetEditingSessionOptions["createDraftId"];
	createExportJobId?: SingleAssetEditingSessionOptions["createExportJobId"];
	createGeneratedMediaId?: SingleAssetEditingSessionOptions["createGeneratedMediaId"];
	defaultExportRunner?: SingleAssetEditingSessionOptions["defaultExportRunner"];
	deliverGeneratedMedia?: SingleAssetEditingSessionOptions["deliverGeneratedMedia"];
	generatedBlob?: Blob;
	inspectLocalAsset?: SingleAssetEditingSessionOptions["inspectLocalAsset"];
	sessionRef: { current: SingleAssetEditingSession | null };
}) {
	sessionRef.current = useSingleAssetEditingSession({
		confirmCloseFile,
		createAssetId,
		createDraftId,
		createExportJobId,
		createGeneratedMediaId,
		defaultExportRunner: defaultExportRunner ?? {
			cancelSupported: true,
			run: async () => ({
				blob:
					generatedBlob ?? new Blob(["generated media"], { type: "video/mp4" }),
			}),
		},
		deliverGeneratedMedia,
		inspectLocalAsset,
		now: () => 1_717_171_717,
		runtime: supportedRuntime,
	});

	return null;
}

function readGeneratedMedia(
	session: SingleAssetEditingSession | null,
): GeneratedMedia {
	if (session?.session.status !== "ready") {
		throw new Error("Expected a ready session.");
	}

	if (session.session.export.status !== "succeeded") {
		throw new Error("Expected a succeeded export.");
	}

	return session.session.export.generatedMedia;
}

type SingleAssetEditingSessionOptions = Parameters<
	typeof useSingleAssetEditingSession
>[0];

type Deferred<T> = {
	promise: Promise<T>;
	reject: (reason?: unknown) => void;
	resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
	let reject: (reason?: unknown) => void = () => {};
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		reject = promiseReject;
		resolve = promiseResolve;
	});

	return {
		promise,
		reject,
		resolve,
	};
}

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const supportedInspection = {
	audioTracks: [
		{
			channels: 2,
			codec: "aac",
			id: "audio-1",
			label: "Voice",
			language: "eng",
			sampleRate: 48_000,
		},
	],
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
	videoTracks: [
		{
			codec: "avc",
			height: 180,
			id: "video-1",
			label: "Main",
			width: 320,
		},
	],
} satisfies LocalMediaAssetInspection;

function downscaledOutputSettings(): OutputSettings {
	return {
		...createDefaultOutputSettings(),
		resolution: {
			height: 90,
			kind: "target-dimensions",
			width: 160,
		},
	};
}
