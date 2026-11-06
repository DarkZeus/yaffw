export type PreviewAudioDecoderWorkMetrics = {
	decodeAudioDataCalls: number;
	decodedFrames: number;
	decodedMediaSeconds: number;
	decodedOutputChunks: number;
	decodedSamples: number;
	metadataPacketScans: number;
	rangeRequests: number;
	remuxedBytes: number;
	remuxedPackets: number;
	windowPulls: number;
};

export function createPreviewAudioDecoderWorkMetrics(): PreviewAudioDecoderWorkMetrics {
	return {
		decodeAudioDataCalls: 0,
		decodedFrames: 0,
		decodedMediaSeconds: 0,
		decodedOutputChunks: 0,
		decodedSamples: 0,
		metadataPacketScans: 0,
		rangeRequests: 0,
		remuxedBytes: 0,
		remuxedPackets: 0,
		windowPulls: 0,
	};
}

export function throwIfPreviewAudioEvidenceAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException("Preview audio evidence run cancelled.", "AbortError");
	}
}
