import { AudioSampleSink, EncodedPacketSink } from "mediabunny";

import {
	AudioPacketTimeline,
	DecodedAudioTimestampProjector,
	audioPacketDurationsMaySpanGaps,
} from "./audio-packet-timeline";

export type MediabunnyAudioFormat = {
	numberOfChannels: number;
	sampleRate: number;
};

export type DecodeMediabunnyAudioTrackRangeOptions = {
	endSeconds: number;
	format: MediabunnyAudioFormat;
	signal: AbortSignal;
	startSeconds: number;
	track: ConstructorParameters<typeof AudioSampleSink>[0];
};

export async function decodeMediabunnyAudioTrackRange({
	endSeconds,
	format,
	signal,
	startSeconds,
	track,
}: DecodeMediabunnyAudioTrackRangeOptions): Promise<AudioBuffer> {
	throwIfAborted(signal);
	validateRange(startSeconds, endSeconds);
	validateFormat(format);

	const outputLength = Math.ceil(
		(endSeconds - startSeconds) * format.sampleRate,
	);
	if (!Number.isSafeInteger(outputLength) || outputLength <= 0) {
		throw new Error(
			`Decoded audio range requires an invalid frame count: ${outputLength}.`,
		);
	}

	const output = createBrowserAudioBuffer({
		length: outputLength,
		numberOfChannels: format.numberOfChannels,
		sampleRate: format.sampleRate,
	});
	const preRollSeconds = (await track.getPreRollDuration()) ?? 0;
	const packetTimeline = await readAudioPacketTimeline({
		endSeconds,
		sampleRate: format.sampleRate,
		signal,
		startSeconds: startSeconds - preRollSeconds,
		track,
	});
	const decodeStartSeconds = packetTimeline.decodeStartFor(
		startSeconds,
		preRollSeconds,
	);
	const timestampProjector = new DecodedAudioTimestampProjector(
		decodeStartSeconds,
	);
	const sink = new AudioSampleSink(track);
	let copiedFrameCount = 0;

	for await (const sample of sink.samples(decodeStartSeconds, endSeconds)) {
		throwIfAborted(signal);

		try {
			if (
				sample.sampleRate !== format.sampleRate ||
				sample.numberOfChannels !== format.numberOfChannels
			) {
				throw new Error(
					`Decoded audio format changed from ${format.sampleRate}Hz/${format.numberOfChannels} channels to ${sample.sampleRate}Hz/${sample.numberOfChannels} channels.`,
				);
			}

			const projectedTimestamp = timestampProjector.project(
				sample.timestamp,
				sample.numberOfFrames / sample.sampleRate,
				packetTimeline,
			);
			const projectedStartFrame = Math.round(
				(projectedTimestamp - startSeconds) * format.sampleRate,
			);
			const sourceStartFrame = Math.max(0, -projectedStartFrame);
			const targetStartFrame = Math.max(0, projectedStartFrame);
			const frameCount = Math.max(
				0,
				Math.min(
					sample.numberOfFrames - sourceStartFrame,
					output.length - targetStartFrame,
				),
			);

			if (frameCount === 0) {
				continue;
			}

			for (let channel = 0; channel < format.numberOfChannels; channel += 1) {
				const destination = output
					.getChannelData(channel)
					.subarray(targetStartFrame, targetStartFrame + frameCount);
				sample.copyTo(destination, {
					format: "f32-planar",
					frameCount,
					frameOffset: sourceStartFrame,
					planeIndex: channel,
				});
			}

			copiedFrameCount += frameCount;
			throwIfAborted(signal);
		} finally {
			sample.close();
		}
	}

	throwIfAborted(signal);
	if (copiedFrameCount === 0) {
		throw new Error("The audio track decoded no presentable samples.");
	}

	return output;
}

async function readAudioPacketTimeline({
	endSeconds,
	sampleRate,
	signal,
	startSeconds,
	track,
}: {
	endSeconds: number;
	sampleRate: number;
	signal: AbortSignal;
	startSeconds: number;
	track: ConstructorParameters<typeof EncodedPacketSink>[0];
}): Promise<AudioPacketTimeline> {
	const timeline = new AudioPacketTimeline({
		packetDurationsMaySpanGaps: audioPacketDurationsMaySpanGaps(
			await track.getCodec(),
		),
		sampleRate,
	});
	const sink = new EncodedPacketSink(track);
	let precedingUnknownPacket: { timestamp: number } | null = null;
	let precedingKnownRange: { startSeconds: number; endSeconds: number } | null =
		null;

	for await (const packet of sink.packets(undefined, undefined, {
		metadataOnly: true,
	})) {
		throwIfAborted(signal);
		if (
			!Number.isFinite(packet.timestamp) ||
			!Number.isFinite(packet.duration) ||
			packet.duration < 0
		) {
			continue;
		}
		// A zero duration means unknown, so it can overlap the requested start.
		// Keep only the immediate predecessor until its next timestamp is known.
		if (precedingUnknownPacket) {
			if (packet.timestamp > startSeconds) {
				if (precedingKnownRange) timeline.add(precedingKnownRange);
				timeline.add({
					startSeconds: precedingUnknownPacket.timestamp,
					endSeconds: precedingUnknownPacket.timestamp,
				});
			}
			precedingUnknownPacket = null;
		}
		if (packet.duration === 0 && packet.timestamp <= startSeconds) {
			precedingUnknownPacket = packet;
			continue;
		}
		if (packet.timestamp + packet.duration <= startSeconds) {
			precedingKnownRange = {
				startSeconds: packet.timestamp,
				endSeconds: packet.timestamp + packet.duration,
			};
			continue;
		}

		timeline.add({
			endSeconds: packet.timestamp + packet.duration,
			startSeconds: packet.timestamp,
		});
		// One packet past the range bounds a trailing gap.
		if (packet.timestamp >= endSeconds) {
			break;
		}
	}
	if (precedingUnknownPacket) {
		if (precedingKnownRange) timeline.add(precedingKnownRange);
		timeline.add({
			startSeconds: precedingUnknownPacket.timestamp,
			endSeconds: precedingUnknownPacket.timestamp,
		});
	}

	timeline.sort();
	return timeline;
}

export function createBrowserAudioBuffer({
	length,
	numberOfChannels,
	sampleRate,
}: {
	length: number;
	numberOfChannels: number;
	sampleRate: number;
}): AudioBuffer {
	if (typeof AudioBuffer !== "undefined") {
		return new AudioBuffer({ length, numberOfChannels, sampleRate });
	}

	return new OfflineAudioContext(
		numberOfChannels,
		length,
		sampleRate,
	).createBuffer(numberOfChannels, length, sampleRate);
}

function validateRange(startSeconds: number, endSeconds: number) {
	if (
		!Number.isFinite(startSeconds) ||
		!Number.isFinite(endSeconds) ||
		startSeconds < 0 ||
		endSeconds <= startSeconds
	) {
		throw new Error(
			`Expected a positive decoded audio range, got [${startSeconds}, ${endSeconds}).`,
		);
	}
}

function validateFormat(format: MediabunnyAudioFormat) {
	if (
		!Number.isSafeInteger(format.numberOfChannels) ||
		format.numberOfChannels <= 0 ||
		!Number.isSafeInteger(format.sampleRate) ||
		format.sampleRate <= 0
	) {
		throw new Error(
			`Expected a valid decoded audio format, got ${format.sampleRate}Hz/${format.numberOfChannels} channels.`,
		);
	}
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new DOMException(
			"Decoded audio preparation was cancelled.",
			"AbortError",
		);
	}
}
