import { createDefaultAudioMix } from "../../src/editor-core/audio-mix";
import { analyzeLocalMediaAssetDraft } from "../../src/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "../../src/editor-core/local-file-import";
import { createDefaultOutputSettings } from "../../src/editor-core/model";
import { resolveOutputPlan } from "../../src/editor-core/output-settings";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../../src/editor-next/export/adapters/mediabunny-output-support";
import { inspectGeneratedMediaBlob } from "../../src/editor-next/export/generated-media/generated-media-inspector";
import { browserDefaultExportRunner } from "../../src/editor-next/export/runners/default-export-runner";
import { inspectBrowserLocalMediaAssetDraft } from "../../src/editor-next/media-asset/adapters/browser-local-asset-analyzer";

export async function checkExport({
	file,
	noAudio,
	end = 13.283,
	abortAtProcessing = false,
}: {
	file: string;
	noAudio: boolean;
	end?: number;
	abortAtProcessing?: boolean;
}) {
	console.log("proof:fetch");
	const source = new File(
		[await (await fetch(`/tmp/file-backed-export/${file}`)).blob()],
		file,
		{ type: "video/mp4" },
	);
	console.log("proof:analyze", source.size);
	const analysis = await analyzeLocalMediaAssetDraft(
		createLocalMediaAssetDraft(source),
		{
			inspect: inspectBrowserLocalMediaAssetDraft,
		},
	);
	if (analysis.status !== "ready") throw new Error(JSON.stringify(analysis));
	const outputSettings = createDefaultOutputSettings();
	if (noAudio) outputSettings.audioCodec = { kind: "no-audio" };
	const controller = new AbortController();
	const audioMix = createDefaultAudioMix(analysis.asset);
	const output = resolveOutputPlan({
		asset: analysis.asset,
		audioMix,
		outputSettings,
		support: MEDIABUNNY_OUTPUT_SUPPORT,
	});
	if (output.kind === "invalid") throw new Error(output.error);
	const request = {
		audioMix,
		resolvedOutput: output.plan,
		selection: { startUs: 1_137_000, endUs: Math.round(end * 1e6) },
		signal: controller.signal,
		source,
		onProgress: (event: { phase: string }) => {
			if (abortAtProcessing && event.phase === "encoding") controller.abort();
		},
	};
	const proof = globalThis as unknown as {
		proof: {
			phase: string;
			result?: Blob;
			inspection?: unknown;
			stats?: unknown;
		};
	};
	proof.proof = { phase: "export" };
	const start = performance.now();
	console.log("proof:run");
	const result = await browserDefaultExportRunner.run(request);
	proof.proof.result = result.blob;
	proof.proof.phase = "retained";
	return {
		elapsedMs: performance.now() - start,
		size: result.blob.size,
		fileBacked: result.blob instanceof File,
		includedTracks: Object.keys(request.audioMix.tracks).length,
	};
}

export async function inspect() {
	const state = (
		globalThis as unknown as { proof: { phase: string; result: Blob } }
	).proof;
	state.phase = "inspection";
	return inspectGeneratedMediaBlob(state.result);
}

export async function deliver() {
	const state = (
		globalThis as unknown as { proof: { phase: string; result: Blob } }
	).proof;
	state.phase = "delivery";
	const { deliverBrowserGeneratedMedia } = await import(
		"../../src/editor-next/export/generated-media/generated-media-delivery"
	);
	deliverBrowserGeneratedMedia({
		blob: state.result,
		generatedMedia: { fileName: "proof.mp4" } as Parameters<
			typeof deliverBrowserGeneratedMedia
		>[0]["generatedMedia"],
	});
}

export async function deliveryRace() {
	const staging = (
		globalThis as unknown as { proofStaging: { dispose(): Promise<void> } }
	).proofStaging;
	await deliver();
	await staging.dispose();
	const blob = (globalThis as unknown as { proof: { result: Blob } }).proof
		.result;
	try {
		await blob.slice(0, 16).arrayBuffer();
		return { readAfterDeletion: "succeeded" };
	} catch (error) {
		return {
			readAfterDeletion: error instanceof Error ? error.name : String(error),
		};
	}
}
