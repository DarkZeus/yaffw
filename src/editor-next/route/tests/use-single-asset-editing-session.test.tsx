/* @vitest-environment jsdom */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import type { GeneratedMedia, OutputSettings } from "@/editor-core/model";
import { createDefaultOutputSettings } from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";

import { useSingleAssetEditingSession } from "../session/use-single-asset-editing-session";
import type { SingleAssetEditingSession } from "../types/single-asset-editing-session.types";

afterEach(() => {
	cleanup();
});

describe("useSingleAssetEditingSession", () => {
	it("starts Export with the applied resolution snapshot", async () => {
		const run = vi.fn(async () => ({
			blob: new Blob(["generated media"], { type: "video/mp4" }),
		}));
		const sessionRef: { current: SingleAssetEditingSession | null } = {
			current: null,
		};

		render(
			<SingleAssetEditingSessionProbe
				defaultExportRunner={{ cancelSupported: true, run }}
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

		const outputSettings = smallDownscaledOutputSettings();
		act(() => {
			sessionRef.current?.commands.applyOutputSettings(outputSettings);
		});
		await act(async () => {
			await sessionRef.current?.commands.startDefaultExport();
		});

		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({ outputSettings }),
		);
		const session = sessionRef.current?.session;
		expect(session?.status).toBe("ready");
		if (session?.status !== "ready" || session.export.status !== "succeeded") {
			throw new Error("Expected a succeeded export.");
		}
		expect(session.export.job.snapshot.outputSettings.resolution).toEqual({
			height: 90,
			kind: "target-dimensions",
			width: 160,
		});
	});

	it("ignores stale failed asset analysis after a newer Media asset is ready", async () => {
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
		});
	});

	it("invalidates retained Generated media blobs when editing decisions reset the export result", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const deliverGeneratedMedia = vi.fn();
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
			sessionRef.current?.commands.downloadGeneratedMedia(generatedMedia);
		});
		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);

		act(() => {
			sessionRef.current?.commands.setSelectionStartFromPlayhead(1_000_000);
		});
		await waitFor(() => {
			const session = sessionRef.current?.session;
			expect(session?.status).toBe("ready");
			if (session?.status !== "ready") {
				return;
			}
			expect(session.export.status).toBe("reviewing");
		});

		act(() => {
			sessionRef.current?.commands.downloadGeneratedMedia(generatedMedia);
		});

		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);
	});

	it("invalidates retained Generated media blobs when changed Output settings are applied", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const deliverGeneratedMedia = vi.fn();
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
});

function SingleAssetEditingSessionProbe({
	createAssetId = () => "asset-1",
	createDraftId = () => "draft-1",
	defaultExportRunner,
	deliverGeneratedMedia = () => {},
	generatedBlob,
	inspectLocalAsset = async () => supportedInspection,
	sessionRef,
}: {
	createAssetId?: SingleAssetEditingSessionOptions["createAssetId"];
	createDraftId?: SingleAssetEditingSessionOptions["createDraftId"];
	defaultExportRunner?: SingleAssetEditingSessionOptions["defaultExportRunner"];
	deliverGeneratedMedia?: SingleAssetEditingSessionOptions["deliverGeneratedMedia"];
	generatedBlob?: Blob;
	inspectLocalAsset?: SingleAssetEditingSessionOptions["inspectLocalAsset"];
	sessionRef: { current: SingleAssetEditingSession | null };
}) {
	sessionRef.current = useSingleAssetEditingSession({
		confirmCloseFile: () => true,
		createAssetId,
		createDraftId,
		createExportJobId: () => "export-1",
		createGeneratedMediaId: () => "generated-1",
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
	resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});

	return {
		promise,
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
			height: 720,
			kind: "target-dimensions",
			width: 1280,
		},
	};
}

function smallDownscaledOutputSettings(): OutputSettings {
	return {
		...createDefaultOutputSettings(),
		resolution: {
			height: 90,
			kind: "target-dimensions",
			width: 160,
		},
	};
}
