import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";
import { createMediaWindowProvider } from "../../src/editor-next/audio/engine/media-window-provider";
import { decodeMediabunnyAudioTrackRange } from "../../src/editor-next/media-work/adapters/mediabunny-audio-buffer";
import { createMediabunnyScrubFrameProvider } from "../../src/editor-next/preview/scrub/mediabunny-scrub-frame-provider";
import { loadVideoStripThumbnailsOnCurrentThread } from "../../src/editor-next/selection/video-strip/selection-video-strip-loader";

function sourceFrom(base64: string) {
	return new Blob([
		Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
	]);
}

export async function checkVideo(base64: string) {
	const source = sourceFrom(base64);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("Missing video track");
		const sink = new EncodedPacketSink(track);
		const targets = [59.83, 59.93, 20.13, 0.13, 40.23, 58.13];
		const lookup = [];
		for (const target of targets) {
			const packetStartedAt = performance.now();
			const packet = await sink.getPacket(target, { metadataOnly: true });
			const packetElapsedMs = performance.now() - packetStartedAt;
			const keyStartedAt = performance.now();
			const key = await sink.getKeyPacket(target, { metadataOnly: true });
			const keyElapsedMs = performance.now() - keyStartedAt;
			if (!packet || !key) throw new Error(`No packets at ${target}`);
			lookup.push({
				target,
				packet: packet.timestamp,
				key: key.timestamp,
				packetElapsedMs,
				keyElapsedMs,
			});
		}
		let deliver: ((value: number) => void) | null = null;
		let reject: ((reason: Error) => void) | null = null;
		const provider = createMediabunnyScrubFrameProvider({
			source,
			frameDurationUs: 100_000,
			displayWidth: 160,
			displayHeight: 90,
			onFrame: (frame) => deliver?.(frame.actualTimestampUs / 1_000_000),
			onUnavailable: (reason) => reject?.(new Error(reason)),
		});
		const scrub = [];
		try {
			for (const target of targets) {
				const startedAt = performance.now();
				const actual = await new Promise<number>((resolve, fail) => {
					const timeout = setTimeout(
						() => fail(new Error(`Scrub timeout ${target}`)),
						20_000,
					);
					deliver = (value) => {
						clearTimeout(timeout);
						resolve(value);
					};
					reject = (error) => {
						clearTimeout(timeout);
						fail(error);
					};
					provider.requestFrame(Math.round(target * 1_000_000), {
						priority: "final",
					});
				});
				scrub.push({
					target,
					actual,
					elapsedMs: performance.now() - startedAt,
				});
			}
		} finally {
			provider.dispose();
		}
		const strip = await loadVideoStripThumbnailsOnCurrentThread({
			source,
			assetDurationUs: 61_000_000,
			devicePixelRatio: 1,
			thumbnailHeightPx: 54,
			timestampsUs: targets.map((time) => Math.round(time * 1_000_000)),
		});
		if (strip.status !== "ready") throw new Error(strip.reason);
		return {
			lookup,
			scrub,
			strip: strip.frames.map((frame) => ({
				timestampUs: frame.timestampUs,
				bytes: frame.imageBlob.size,
			})),
		};
	} finally {
		input.dispose();
	}
}

function rms(buffer: AudioBuffer, offset: number, duration = 0.1) {
	const samples = buffer
		.getChannelData(0)
		.subarray(
			Math.round(offset * buffer.sampleRate),
			Math.round((offset + duration) * buffer.sampleRate),
		);
	return Math.sqrt(
		samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
	);
}

export async function checkAudio(base64: string, sync = false) {
	const source = sourceFrom(base64);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	const provider = await createMediaWindowProvider({ source });
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error("Missing audio track");
		const format = {
			sampleRate: await track.getSampleRate(),
			numberOfChannels: await track.getNumberOfChannels(),
		};
		const firstPacket = await new EncodedPacketSink(track).getFirstPacket({
			metadataOnly: true,
		});
		const results = [];
		for (const start of sync ? [0, 2.005, 2.01] : [0, 2.5, 3.2]) {
			const endSeconds = sync ? 9.8 : 4.5;
			const controller = new AbortController();
			const mix = await decodeMediabunnyAudioTrackRange({
				track,
				format,
				startSeconds: start,
				endSeconds,
				signal: controller.signal,
			});
			const generation = provider.openGeneration({
				startSeconds: start,
				signal: controller.signal,
			});
			try {
				const pulled = await generation.pullThrough(endSeconds);
				const state = pulled[0];
				if (!state || state.kind === "failure")
					throw new Error(JSON.stringify(state));
				const preview = new AudioBuffer({
					...format,
					length: Math.ceil((endSeconds - start) * format.sampleRate),
				});
				if (state.kind === "playable")
					for (const chunk of state.chunks) {
						const offset = Math.round(
							(chunk.startSeconds - start) * format.sampleRate,
						);
						preview
							.getChannelData(0)
							.set(
								chunk.audioBuffer
									.getChannelData(0)
									.subarray(0, preview.length - offset),
								offset,
							);
					}
				const times = [0.05, 1.5, 2.5, 3.5, 4].filter((time) => time >= start);
				results.push({
					start,
					mixOnsets: sync
						? clickOnsets(mix).map((time) => time + start)
						: undefined,
					previewOnsets: sync
						? clickOnsets(preview).map((time) => time + start)
						: undefined,
					probes: times.map((time) => ({
						time,
						mixRms: rms(mix, time - start),
						previewRms: rms(preview, time - start),
					})),
				});
			} finally {
				await generation.cancel();
			}
		}
		return { firstPacketTimestamp: firstPacket?.timestamp, results };
	} finally {
		await provider.dispose();
		input.dispose();
	}
}

function clickOnsets(buffer: AudioBuffer) {
	const result: number[] = [];
	let active = false;
	for (let time = 0; time + 0.005 <= buffer.duration; time += 0.005) {
		const audible = rms(buffer, time, 0.005) > 0.001;
		if (audible && !active) result.push(time);
		active = audible;
	}
	return result;
}
