import type { InputTrack } from "mediabunny";

export async function resolveMediabunnyInputTrackCodec(
	track: Pick<
		InputTrack,
		"getCodec" | "getCodecParameterString" | "getInternalCodecId"
	>,
) {
	const parameterString = readableCodec(await track.getCodecParameterString());
	if (parameterString) {
		return parameterString;
	}

	const codec = readableCodec(await track.getCodec());
	if (codec) {
		return codec;
	}

	return readableCodec(await track.getInternalCodecId());
}

function readableCodec(codec: unknown): string | undefined {
	return typeof codec === "string" && codec.length > 0 ? codec : undefined;
}
