import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { analyzeLocalMediaAssetDraft } from "../../src/editor-core/local-file-analysis";
import { inspectBrowserLocalMediaAssetDraft } from "../../src/editor-next/media-asset/adapters/browser-local-asset-analyzer";

// Loaded through Vite so both production imports and the pinned dependency use
// the application's real browser module graph. No analyzer mocking/interception.
export async function analyzeFixture(name: string, base64: string) {
	const file = new File(
		[Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))],
		`${name}.mp4`,
		{ type: "video/mp4" },
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("Fixture has no video track");
		const boundedMetrics = await track.computeFrameRateMetrics({
			targetPacketCount: 256,
		});
		const wholeFileMetrics = await track.computeFrameRateMetrics({
			targetPacketCount: Number.POSITIVE_INFINITY,
		});
		const result = await analyzeLocalMediaAssetDraft(
			{
				id: name,
				kind: "local-file",
				label: file.name,
				provenance: {
					fileName: file.name,
					sizeBytes: file.size,
					mimeType: file.type,
				},
				source: file,
			},
			{
				inspect: inspectBrowserLocalMediaAssetDraft,
			},
		);
		if (result.status !== "ready") throw new Error(JSON.stringify(result));
		return {
			boundedMetrics,
			wholeFileMetrics,
			frameTiming: result.asset.frameTiming,
			durationUs: result.asset.durationUs,
		};
	} finally {
		input.dispose();
	}
}
