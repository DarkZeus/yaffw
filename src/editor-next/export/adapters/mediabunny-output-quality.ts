import {
	QUALITY_HIGH,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_VERY_HIGH,
	QUALITY_VERY_LOW,
	type Quality,
} from "mediabunny";

import type { ResolvedOutputQuality } from "@/editor-core/output-settings";

const MEDIABUNNY_SUBJECTIVE_QUALITIES = {
	high: QUALITY_HIGH,
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	"very-high": QUALITY_VERY_HIGH,
	"very-low": QUALITY_VERY_LOW,
} as const;

export function toMediabunnyBitrate(
	quality: Exclude<ResolvedOutputQuality, { kind: "invalid" }>,
): number | Quality | undefined {
	if (quality.kind === "preserve-source") {
		return undefined;
	}

	if (quality.kind === "custom-bitrate") {
		return quality.bitrateBps;
	}

	return MEDIABUNNY_SUBJECTIVE_QUALITIES[quality.quality];
}
