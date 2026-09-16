import {
	type OutputPair,
	type ScheduledSignal,
	detectBursts,
} from "./analysis";
import fixture from "./fixture-manifest.json";

type Frame = {
	mediaTime: number;
	expectedDisplayTime: number;
	callbackTime: number;
	presentedFrames: number;
	bright: boolean;
};
type ContextRecord = {
	context: AudioContext;
	sources: ScheduledSignal[];
	pairs: OutputPair[];
	states: { state: string; at: number }[];
	maxScanMs: number;
};
const records: ContextRecord[] = [];
const NativeContext = window.AudioContext;

// This observer is injected only into a disposable verification browser context.
// Native start is called before scanning, no PCM is retained and no clock is set.
window.AudioContext = class extends NativeContext {
	constructor(options?: AudioContextOptions) {
		super(options);
		const record: ContextRecord = {
			context: this,
			sources: [],
			pairs: [],
			states: [],
			maxScanMs: 0,
		};
		records.push(record);
		this.addEventListener("statechange", () =>
			record.states.push({ state: this.state, at: performance.now() }),
		);
	}
	createBufferSource() {
		const source = super.createBufferSource();
		const record = records.find((item) => item.context === this);
		if (!record) throw new Error("Unobserved context");
		const start = source.start.bind(source);
		const stop = source.stop.bind(source);
		const disconnect = source.disconnect.bind(source);
		let signal: ScheduledSignal | undefined;
		source.start = (...args) => {
			const [when = 0, offset = 0, duration = source.buffer?.duration ?? 0] =
				args;
			const calledAt = this.currentTime;
			start(...args);
			const began = performance.now();
			const buffer = source.buffer;
			if (!buffer) throw new Error("Fixture source has no PCM");
			signal = {
				bursts: detectBursts(
					buffer.getChannelData(0),
					buffer.sampleRate,
					fixture.thresholds.audioAbsoluteAmplitude,
				),
				when,
				calledAt,
				offset,
				duration,
				rate: source.playbackRate.value,
				stoppedAt: null,
				sampleRate: buffer.sampleRate,
			};
			record.sources.push(signal);
			record.maxScanMs = Math.max(record.maxScanMs, performance.now() - began);
		};
		source.stop = (when = 0) => {
			stop(when);
			if (signal) signal.stoppedAt = Math.max(this.currentTime, when);
		};
		// The production scheduler uses no-argument disconnect during release.
		source.disconnect = () => {
			disconnect();
			if (signal)
				signal.stoppedAt = Math.min(
					signal.stoppedAt ?? Number.POSITIVE_INFINITY,
					this.currentTime,
				);
		};
		return source;
	}
};

let video: HTMLVideoElement | null = null;
let frames: Frame[] = [];
let callbackId = 0;
let interval: ReturnType<typeof setInterval> | undefined;
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const pixels = canvas.getContext("2d", { willReadFrequently: true });
if (!pixels) throw new Error("Canvas unavailable for flash detection");
const captureFrame: VideoFrameRequestCallback = (now, metadata) => {
	if (!video) return;
	pixels.drawImage(video, 0, 0, 1, 1);
	const rgba = pixels.getImageData(0, 0, 1, 1).data;
	frames.push({
		mediaTime: metadata.mediaTime,
		expectedDisplayTime: metadata.expectedDisplayTime,
		callbackTime: now,
		presentedFrames: metadata.presentedFrames,
		bright:
			(rgba[0] + rgba[1] + rgba[2]) / 3 > fixture.thresholds.videoLuminance,
	});
	callbackId = video.requestVideoFrameCallback(captureFrame);
};

function stopCapture() {
	if (video) video.cancelVideoFrameCallback(callbackId);
	clearInterval(interval);
}

const observer = {
	begin() {
		stopCapture();
		video = document.querySelector("video");
		if (!video || !video.requestVideoFrameCallback)
			throw new Error("Native video frame callbacks unavailable");
		frames = [];
		for (const record of records) {
			record.sources = [];
			record.pairs = [];
			record.states = [];
			record.maxScanMs = 0;
		}
		callbackId = video.requestVideoFrameCallback(captureFrame);
		interval = setInterval(() => {
			for (const record of records) {
				if (
					record.context.state !== "running" ||
					!record.context.getOutputTimestamp
				)
					continue;
				const pair = record.context.getOutputTimestamp();
				if (
					pair.contextTime !== undefined &&
					pair.performanceTime !== undefined
				)
					record.pairs.push({
						contextTime: pair.contextTime,
						performanceTime: pair.performanceTime,
						observedAt: performance.now(),
					});
			}
		}, 20);
	},
	finish() {
		stopCapture();
		return {
			frames,
			contexts: records.map((record) => ({
				...record,
				context: undefined,
				state: record.context.state,
				sampleRate: record.context.sampleRate,
				baseLatency: record.context.baseLatency,
				outputLatency: record.context.outputLatency,
			})),
			video: {
				muted: video?.muted,
				volume: video?.volume,
				playbackRate: video?.playbackRate,
				currentTime: video?.currentTime,
			},
		};
	},
	states: () => records.map((record) => record.context.state),
};

declare global {
	interface Window {
		previewAlignmentObserver: typeof observer;
	}
}
window.previewAlignmentObserver = observer;
export type Capture = ReturnType<typeof observer.finish>;
