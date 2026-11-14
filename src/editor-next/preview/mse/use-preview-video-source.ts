import { useEffect, useState } from "react";
import type { ReadyMediaAsset } from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import { createMsePreview } from "./create-mse-preview";

type PreviewSource = {
	url: string;
	waitForFragment?: ReturnType<typeof createMsePreview>["waitForFragment"];
	canResyncTo?: ReturnType<typeof createMsePreview>["canResyncTo"];
};

export function usePreviewVideoSource({
	asset,
	cleanupScope,
	file,
	video,
}: {
	asset: ReadyMediaAsset;
	cleanupScope?: ActiveMediaAssetCleanupScope;
	file: Blob;
	video: HTMLVideoElement | null;
}) {
	const [preview, setPreview] = useState<PreviewSource>({
		url: "",
	});
	const codec = asset.tracks.video[0]?.codec;
	const audioCodec = asset.tracks.audio[0]?.codec;

	useEffect(() => {
		if (!video) return;
		const nativeUrl = URL.createObjectURL(file);
		let mse: ReturnType<typeof createMsePreview> | undefined;
		if (
			/^avc[13]\./i.test(codec ?? "") &&
			(!audioCodec || /^mp4a\.40\./i.test(audioCodec)) &&
			typeof MediaSource !== "undefined" &&
			typeof Worker !== "undefined" &&
			MediaSource.isTypeSupported(`video/mp4; codecs="${codec}"`)
		) {
			try {
				mse = createMsePreview({ file });
			} catch {
				// The original file URL is immediately available as a fallback.
			}
		}

		let disposed = false;
		function dispose() {
			disposed = true;
			mse?.close();
			URL.revokeObjectURL(nativeUrl);
		}
		const registration = cleanupScope?.registerCleanup(dispose);
		if (!disposed) {
			setPreview(
				mse
					? {
							url: mse.url,
							waitForFragment: mse.waitForFragment,
							canResyncTo: mse.canResyncTo,
						}
					: { url: nativeUrl },
			);
			if (mse && video) {
				const fallback = () => {
					if (disposed) return;
					mse?.close();
					setPreview({ url: nativeUrl });
				};
				void mse.play(video).catch(fallback);
			}
		}
		return registration?.dispose ?? dispose;
	}, [audioCodec, cleanupScope, codec, file, video]);

	return preview;
}
