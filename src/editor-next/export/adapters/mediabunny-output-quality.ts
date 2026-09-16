import { type AudioCodec, Quality } from "mediabunny";

import type { ResolvedOutputQuality } from "@/editor-core/output-settings";

export function toMediabunnyQuality(
	quality: Exclude<ResolvedOutputQuality, { kind: "invalid" }>,
): Quality | undefined {
	if (quality.kind === "preserve-source") {
		return undefined;
	}

	if (quality.kind === "custom-bitrate") {
		return new Quality({ bitrate: quality.bitrateBps });
	}

	return new Quality(quality.quality);
}

export function toMediabunnyAudioQuality({
	codec,
	quality,
}: {
	codec: AudioCodec;
	quality: Exclude<ResolvedOutputQuality, { kind: "invalid" }>;
}): Quality | undefined {
	const requestedQuality = toMediabunnyQuality(quality);
	if (
		requestedQuality !== undefined ||
		codec === "flac" ||
		codec.startsWith("pcm-")
	) {
		return requestedQuality;
	}

	return new Quality("medium");
}
