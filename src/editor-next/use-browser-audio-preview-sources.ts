import { useEffect, useState } from "react";

import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";
import {
	type BrowserAudioPreviewSource,
	type BrowserAudioPreviewSourceFailure,
	prepareBrowserAudioPreviewSources,
	revokeBrowserAudioPreviewSources,
} from "./browser-audio-preview-sources";

export type BrowserAudioPreviewSourcesState =
	| {
			status: "disabled";
	  }
	| {
			status: "loading";
	  }
	| {
			failures: BrowserAudioPreviewSourceFailure[];
			sources: BrowserAudioPreviewSource[];
			status: "ready";
	  }
	| {
			failures: BrowserAudioPreviewSourceFailure[];
			reason: string;
			status: "failed";
	  };

export function useBrowserAudioPreviewSources({
	audioMix,
	asset,
	enabled,
	source,
}: {
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
}): BrowserAudioPreviewSourcesState {
	const [state, setState] = useState<BrowserAudioPreviewSourcesState>({
		status: "disabled",
	});
	const channelModeKey = createAudioPreviewChannelModeKey(asset, audioMix);
	const finalPeakGuardDb = audioMix.finalPeakGuardDb;

	useEffect(() => {
		if (!enabled) {
			setState({ status: "disabled" });
			return;
		}

		const abortController = new AbortController();
		let cancelled = false;
		let liveSources: BrowserAudioPreviewSource[] = [];

		setState({ status: "loading" });

		void prepareBrowserAudioPreviewSources({
			audioMix: createAudioPreviewMixSnapshot({
				asset,
				channelModeKey,
				finalPeakGuardDb,
			}),
			asset,
			signal: abortController.signal,
			source,
		})
			.then((result) => {
				if (cancelled) {
					revokeBrowserAudioPreviewSources({ sources: result.sources });
					return;
				}

				liveSources = result.sources;

				if (result.sources.length > 0) {
					setState({
						failures: result.failures,
						sources: result.sources,
						status: "ready",
					});
					return;
				}

				setState({
					failures: result.failures,
					reason:
						result.failures[0]?.reason ??
						"No audio preview tracks could be prepared.",
					status: "failed",
				});
			})
			.catch((error: unknown) => {
				if (cancelled || isAbortError(error)) {
					return;
				}

				setState({
					failures: [],
					reason: errorToMessage(error),
					status: "failed",
				});
			});

		return () => {
			cancelled = true;
			abortController.abort();
			revokeBrowserAudioPreviewSources({ sources: liveSources });
		};
	}, [asset, channelModeKey, enabled, finalPeakGuardDb, source]);

	return state;
}

function createAudioPreviewChannelModeKey(
	asset: ReadyMediaAsset,
	audioMix: AudioMix,
) {
	return JSON.stringify(
		asset.tracks.audio.map(
			(track) =>
				[
					track.id,
					audioMix.tracks[track.id]?.channelMode ?? "preserve",
				] satisfies [string, AudioTrackChannelMode],
		),
	);
}

function createAudioPreviewMixSnapshot({
	asset,
	channelModeKey,
	finalPeakGuardDb,
}: {
	asset: ReadyMediaAsset;
	channelModeKey: string;
	finalPeakGuardDb: number;
}): AudioMix {
	const channelModes = new Map(
		JSON.parse(channelModeKey) as Array<[string, AudioTrackChannelMode]>,
	);

	return {
		finalPeakGuardDb,
		outputChannels: 2,
		tracks: Object.fromEntries(
			asset.tracks.audio.map((track) => [
				track.id,
				{
					channelMode: channelModes.get(track.id) ?? "preserve",
					include: true,
					trackId: track.id,
					volumePercent: 100,
				},
			]),
		),
	};
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === "AbortError";
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
