import { vi } from "vitest";
import type { MediaWindowProvider } from "../engine/media-window-provider";

/** Provider double for React ownership tests; decoder behavior is tested separately. */
export function createPreviewAudioProviderStub(
	trackIds: string[] = ["audio-1"],
	durationSeconds = 12,
) {
	return {
		dispose: vi.fn(async () => {}),
		durationSeconds,
		getTrackMetadata: vi.fn(() => ({
			failureReason: null,
			numberOfChannels: 2,
			sampleRate: 48_000,
		})),
		openGeneration: vi.fn<MediaWindowProvider["openGeneration"]>(() => {
			throw new Error(
				"A React ownership test unexpectedly opened a decoder generation.",
			);
		}),
		trackIds,
	} satisfies MediaWindowProvider;
}
