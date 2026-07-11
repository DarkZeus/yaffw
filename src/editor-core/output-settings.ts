import {
	DEFAULT_OUTPUT_PROFILE,
	type OutputSettings,
	type ReadyMediaAsset,
} from "./model";

export type DocumentedOutputContainer = {
	fileExtension: string;
	id: string;
	label: string;
	mimeType: string;
	videoCodecs: string[];
};

export type BrowserLocalOutputSupport = {
	containers: DocumentedOutputContainer[];
};

export type ResolveOutputVideoProfileOptions = {
	asset: Pick<ReadyMediaAsset, "tracks">;
	outputSettings: OutputSettings;
	support: BrowserLocalOutputSupport;
};

export type ResolvedOutputVideoProfile =
	| {
			automaticReplacement?: {
				requestedCodec?: string;
				videoCodec: string;
			};
			container: DocumentedOutputContainer;
			kind: "resolved";
			videoCodec: string;
	  }
	| {
			error: string;
			kind: "invalid";
	  };

export function resolveOutputVideoProfile({
	asset,
	outputSettings,
	support,
}: ResolveOutputVideoProfileOptions): ResolvedOutputVideoProfile {
	const containerId =
		outputSettings.container.kind === "default-output-profile"
			? DEFAULT_OUTPUT_PROFILE.container
			: outputSettings.container.container;
	const container = support.containers.find(({ id }) => id === containerId);

	if (!container) {
		return {
			error: `The selected ${containerId} container is not documented by the browser-local media writer.`,
			kind: "invalid",
		};
	}

	const sourceCodec = normalizeVideoCodec(asset.tracks.video[0]?.codec);
	const requestedCodec =
		outputSettings.videoCodec.kind === "default-output-profile"
			? normalizeVideoCodec(DEFAULT_OUTPUT_PROFILE.videoCodec)
			: outputSettings.videoCodec.kind === "documented-codec"
				? normalizeVideoCodec(outputSettings.videoCodec.codec)
				: sourceCodec;

	if (requestedCodec && container.videoCodecs.includes(requestedCodec)) {
		return {
			container,
			kind: "resolved",
			videoCodec: requestedCodec,
		};
	}

	if (outputSettings.videoCodec.kind === "preserve-source") {
		const replacementCodec = container.videoCodecs[0];
		if (replacementCodec) {
			return {
				automaticReplacement: {
					requestedCodec,
					videoCodec: replacementCodec,
				},
				container,
				kind: "resolved",
				videoCodec: replacementCodec,
			};
		}
	}

	return {
		error: `No documented video codec can satisfy the selected ${container.label} container.`,
		kind: "invalid",
	};
}

function normalizeVideoCodec(codec: string | undefined): string | undefined {
	if (!codec) {
		return undefined;
	}

	const normalized = codec.trim().toLowerCase();

	if (normalized === "h264" || normalized.startsWith("avc1")) {
		return "avc";
	}
	if (
		normalized === "h265" ||
		normalized.startsWith("hvc1") ||
		normalized.startsWith("hev1")
	) {
		return "hevc";
	}
	if (normalized.startsWith("vp09")) {
		return "vp9";
	}
	if (normalized.startsWith("vp08")) {
		return "vp8";
	}
	if (normalized.startsWith("av01")) {
		return "av1";
	}

	return normalized;
}
