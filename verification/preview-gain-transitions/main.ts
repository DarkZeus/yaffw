import type { PreviewAudioContextLike } from "../../src/editor-next/audio/engine/preview-audio-engine";
import { createPreviewAudioGraph } from "../../src/editor-next/audio/engine/preview-audio-graph";
import {
	PREVIEW_GAIN_TRANSITION_SECONDS,
	createPreviewGainTransition,
} from "../../src/editor-next/audio/engine/preview-gain-transition";

const RATE = 48_000;
const LENGTH = 4096;
const START = 512;
const RETARGET = 640;
const DURATION = PREVIEW_GAIN_TRANSITION_SECONDS * RATE;
const TOLERANCE = 0.00001;
type Event = { frame: number; run: () => void };
type Check = {
	name: string;
	maxError: number;
	maxAdjacentDelta: number;
	frames: number;
};

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
function ramp(
	frame: number,
	start: number,
	from: number,
	to: number,
	duration = DURATION,
) {
	return (
		from + (to - from) * Math.min(1, Math.max(0, (frame - start) / duration))
	);
}
function context() {
	return new OfflineAudioContext(2, LENGTH, RATE);
}
function constantBuffer(
	ctx: OfflineAudioContext,
	channels: number[],
	length = LENGTH,
) {
	const buffer = ctx.createBuffer(channels.length, length, ctx.sampleRate);
	channels.forEach((value, channel) =>
		buffer.getChannelData(channel).fill(value),
	);
	return buffer;
}
function source(
	ctx: OfflineAudioContext,
	destination: AudioNode,
	channels = [1, 1],
	start = 0,
	length = LENGTH,
) {
	const node = ctx.createBufferSource();
	node.buffer = constantBuffer(ctx, channels, length);
	node.connect(destination);
	node.start(start / ctx.sampleRate);
	return node;
}
async function render(ctx: OfflineAudioContext, events: Event[] = []) {
	// Suspend at render-quantum boundaries so controls run at their real audio
	// clock time, just as they do in production, including mid-ramp retargets.
	const suspensions = events.map(({ frame, run }) =>
		ctx.suspend(frame / ctx.sampleRate).then(async () => {
			assert(
				Math.round(ctx.currentTime * ctx.sampleRate) === frame,
				`Unexpected suspension time: ${ctx.currentTime}`,
			);
			run();
			await ctx.resume();
		}),
	);
	// Propagate control-point assertions immediately instead of waiting forever
	// for rendering on a context whose suspended callback failed.
	const [output] = await Promise.all([
		ctx.startRendering(),
		Promise.all(suspensions),
	]);
	return output;
}
function measure(
	name: string,
	output: AudioBuffer,
	expected: (frame: number, channel: number) => number,
): Check {
	let maxError = 0;
	let maxAdjacentDelta = 0;
	for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
		const samples = output.getChannelData(channel);
		for (let frame = 0; frame < samples.length; frame += 1) {
			const target = expected(frame, channel);
			const error = Math.abs(samples[frame] - target);
			assert(
				Number.isFinite(samples[frame]) && error <= TOLERANCE,
				`${name}: channel ${channel}, frame ${frame}, expected ${target}, received ${samples[frame]}`,
			);
			if (target === 0)
				assert(
					samples[frame] === 0,
					`${name}: mute is not exact zero at frame ${frame}`,
				);
			maxError = Math.max(maxError, error);
			if (frame)
				maxAdjacentDelta = Math.max(
					maxAdjacentDelta,
					Math.abs(samples[frame] - samples[frame - 1]),
				);
		}
	}
	return { name, maxError, maxAdjacentDelta, frames: output.length };
}
function graph(ctx: OfflineAudioContext) {
	return createPreviewAudioGraph(
		ctx as unknown as PreviewAudioContextLike,
		[
			{
				numberOfChannels: 2,
				sampleRate: RATE,
				trackId: "track",
				trackIndex: 0,
				track: { id: "track", kind: "audio", channels: 2, sampleRate: RATE },
			},
		],
		2,
	);
}
function graphSource(
	ctx: OfflineAudioContext,
	audioGraph: ReturnType<typeof graph>,
	start = 0,
	length = LENGTH,
) {
	const buffer = constantBuffer(ctx, [0.75, 0.25], length);
	const node = ctx.createBufferSource();
	node.buffer = buffer;
	const destination = audioGraph.destination("track", buffer);
	assert(
		destination instanceof AudioNode,
		"Production route must expose a native AudioNode.",
	);
	node.connect(destination);
	node.start(start / RATE);
}

export async function runPreviewGainTransitionChecks() {
	assert(
		DURATION === 384,
		"Production transition duration must be 8 ms at 48 kHz.",
	);
	const checks: Check[] = [];
	for (const [name, initial, target] of [
		["mute", 1, 0],
		["unmute", 0, 1],
		["volume endpoint", 0.2, 0.8],
	] as const) {
		const ctx = context();
		const node = ctx.createGain();
		node.connect(ctx.destination);
		const transition = createPreviewGainTransition(node.gain, initial);
		source(ctx, node);
		checks.push(
			measure(
				name,
				await render(ctx, [
					{
						frame: START,
						run: () => transition.setTarget(target, ctx.currentTime, true),
					},
				]),
				(frame) => ramp(frame, START, initial, target),
			),
		);
	}
	{
		const ctx = context();
		const node = ctx.createGain();
		node.connect(ctx.destination);
		const transition = createPreviewGainTransition(node.gain);
		source(ctx, node);
		const held = ramp(RETARGET, START, 1, 0);
		checks.push(
			measure(
				"mid-ramp retarget from rendered value",
				await render(ctx, [
					{
						frame: START,
						run: () => transition.setTarget(0, ctx.currentTime, true),
					},
					{
						frame: RETARGET,
						run: () => transition.setTarget(1, ctx.currentTime, true),
					},
				]),
				(frame) =>
					frame < RETARGET
						? ramp(frame, START, 1, 0)
						: ramp(frame, RETARGET, held, 1),
			),
		);
	}
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		audioGraph.setTrackVolumeGain(0, 0.5);
		graphSource(ctx, audioGraph, 0, 1024);
		graphSource(ctx, audioGraph, 1024, LENGTH - 1024);
		checks.push(
			measure(
				"production graph composition, repeated target and chunk continuity",
				await render(ctx, [
					{ frame: START, run: () => audioGraph.setOutputGain(0.4, true) },
					{ frame: RETARGET, run: () => audioGraph.setOutputGain(0.4, true) },
					{ frame: 768, run: () => audioGraph.setOutputGain(0.4, true) },
				]),
				(frame, channel) =>
					[0.75, 0.25][channel] * 0.5 * ramp(frame, START, 1, 0.4),
			),
		);
		audioGraph.destroy();
	}
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		audioGraph.setOutputGain(0.25);
		audioGraph.setTrackChannelMode(0, "duplicate-right-to-stereo");
		graphSource(ctx, audioGraph);
		checks.push(
			measure(
				"paused initialization and explicit stereo routing",
				await render(ctx),
				() => 0.0625,
			),
		);
		audioGraph.destroy();
	}
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		graphSource(ctx, audioGraph);
		checks.push(
			measure(
				"settle cancels pending global ramp at target",
				await render(ctx, [
					{ frame: START, run: () => audioGraph.setOutputGain(0, true) },
					{ frame: RETARGET, run: () => audioGraph.settleGains() },
				]),
				(frame, channel) =>
					[0.75, 0.25][channel] *
					(frame < RETARGET ? ramp(frame, START, 1, 0) : 0),
			),
		);
		audioGraph.destroy();
	}
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		graphSource(ctx, audioGraph);
		let replacement: ReturnType<typeof graph> | undefined;
		checks.push(
			measure(
				"destroy during ramp and recreate without stale automation",
				await render(ctx, [
					{ frame: START, run: () => audioGraph.setOutputGain(0, true) },
					{
						frame: RETARGET,
						run: () => {
							audioGraph.destroy();
							replacement = graph(ctx);
							replacement.setTrackMonitorGain(0, 1);
							replacement.setOutputGain(0.2);
							graphSource(ctx, replacement, RETARGET, LENGTH - RETARGET);
						},
					},
				]),
				(frame, channel) =>
					[0.75, 0.25][channel] *
					(frame < RETARGET ? ramp(frame, START, 1, 0) : 0.2),
			),
		);
		replacement?.destroy();
	}
	// A single track transition targets monitor * volume. Independently fading
	// both controls would produce a curved product and fail this sample oracle.
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		graphSource(ctx, audioGraph, 0, 768);
		graphSource(ctx, audioGraph, 768, LENGTH - 768);
		const held = ramp(RETARGET, START, 1, 0.2);
		const mutedHeld = ramp(768, RETARGET, held, 0);
		const resumedHeld = ramp(896, 768, mutedHeld, 0.6);
		const globalHeld = ramp(896, RETARGET, 1, 0.4);
		checks.push(
			measure(
				"interleaved track monitor, volume and global ramps across PCM chunks",
				await render(ctx, [
					{
						frame: START,
						run: () => audioGraph.setTrackVolumeGain(0, 0.2, true),
					},
					{
						frame: RETARGET,
						run: () => {
							audioGraph.setTrackMonitorGain(0, 0, true);
							audioGraph.setOutputGain(0.4, true);
						},
					},
					{
						frame: 768,
						run: () => {
							audioGraph.setTrackVolumeGain(0, 0.6, true);
							audioGraph.setTrackMonitorGain(0, 1, true);
						},
					},
					{
						frame: 896,
						run: () => {
							audioGraph.setTrackVolumeGain(0, 0, true);
							audioGraph.setOutputGain(0.8, true);
						},
					},
				]),
				(frame, channel) => {
					const track =
						frame < RETARGET
							? ramp(frame, START, 1, 0.2)
							: frame < 768
								? ramp(frame, RETARGET, held, 0)
								: frame < 896
									? ramp(frame, 768, mutedHeld, 0.6)
									: ramp(frame, 896, resumedHeld, 0);
					const global =
						frame < 896
							? ramp(frame, RETARGET, 1, 0.4)
							: ramp(frame, 896, globalHeld, 0.8);
					return [0.75, 0.25][channel] * track * global;
				},
			),
		);
		audioGraph.destroy();
	}
	for (const [mode, amplitudes] of [
		["preserve", [0.75, 0.25]],
		["use-left-as-mono", [0.75, 0.75]],
		["use-right-as-mono", [0.25, 0.25]],
		["duplicate-left-to-stereo", [0.75, 0.75]],
		["duplicate-right-to-stereo", [0.25, 0.25]],
		["average-to-mono", [0.5, 0.5]],
	] as const) {
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackChannelMode(0, mode);
		audioGraph.setTrackVolumeGain(0, 0.6);
		audioGraph.setTrackMonitorGain(0, 1);
		graphSource(ctx, audioGraph);
		checks.push(
			measure(
				`track monitor mute/unmute preserves ${mode} routing`,
				await render(ctx, [
					{
						frame: START,
						run: () => audioGraph.setTrackMonitorGain(0, 0, true),
					},
					{
						frame: 1536,
						run: () => audioGraph.setTrackMonitorGain(0, 1, true),
					},
					// Repeated targets must not extend the transition deadline.
					{
						frame: 1664,
						run: () => audioGraph.setTrackVolumeGain(0, 0.6, true),
					},
				]),
				(frame, channel) =>
					amplitudes[channel] *
					(frame < 1536
						? ramp(frame, START, 0.6, 0)
						: ramp(frame, 1536, 0, 0.6)),
			),
		);
		audioGraph.destroy();
	}
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		graphSource(ctx, audioGraph);
		checks.push(
			measure(
				"settle cancels simultaneous track and global automation",
				await render(ctx, [
					{
						frame: START,
						run: () => {
							audioGraph.setTrackVolumeGain(0, 0.4, true);
							audioGraph.setOutputGain(0.5, true);
						},
					},
					{ frame: RETARGET, run: () => audioGraph.settleGains() },
				]),
				(frame, channel) =>
					[0.75, 0.25][channel] *
					(frame < RETARGET
						? ramp(frame, START, 1, 0.4) * ramp(frame, START, 1, 0.5)
						: 0.2),
			),
		);
		audioGraph.destroy();
	}
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		graphSource(ctx, audioGraph);
		let replacement: ReturnType<typeof graph> | undefined;
		checks.push(
			measure(
				"destroy active track and global ramps then recreate with settled track state",
				await render(ctx, [
					{
						frame: START,
						run: () => {
							audioGraph.setTrackMonitorGain(0, 0, true);
							audioGraph.setOutputGain(0, true);
						},
					},
					{
						frame: RETARGET,
						run: () => {
							audioGraph.destroy();
							replacement = graph(ctx);
							replacement.setTrackVolumeGain(0, 0.4);
							replacement.setTrackMonitorGain(0, 1);
							replacement.setOutputGain(0.5);
							graphSource(ctx, replacement, RETARGET, LENGTH - RETARGET);
						},
					},
				]),
				(frame, channel) =>
					[0.75, 0.25][channel] *
					(frame < RETARGET ? ramp(frame, START, 1, 0) ** 2 : 0.2),
			),
		);
		replacement?.destroy();
	}
	for (const sampleRate of [44_100, RATE]) {
		const ctx = new OfflineAudioContext(2, LENGTH, sampleRate);
		const node = ctx.createGain();
		node.connect(ctx.destination);
		const transition = createPreviewGainTransition(node.gain);
		source(ctx, node);
		const duration = PREVIEW_GAIN_TRANSITION_SECONDS * sampleRate;
		const firstHeld = ramp(RETARGET, START, 1, 0, duration);
		const secondHeld = ramp(768, RETARGET, firstHeld, 0.8, duration);
		checks.push(
			measure(
				`rapid and same-time retargets at ${sampleRate} Hz`,
				await render(ctx, [
					{
						frame: START,
						run: () => transition.setTarget(0, ctx.currentTime, true),
					},
					{
						frame: RETARGET,
						run: () => {
							transition.setTarget(1, ctx.currentTime, true);
							transition.setTarget(0.8, ctx.currentTime, true);
						},
					},
					{
						frame: 768,
						run: () => transition.setTarget(0, ctx.currentTime, true),
					},
				]),
				(frame) =>
					frame < RETARGET
						? ramp(frame, START, 1, 0, duration)
						: frame < 768
							? ramp(frame, RETARGET, firstHeld, 0.8, duration)
							: ramp(frame, 768, secondHeld, 0, duration),
			),
		);
	}
	{
		const ctx = context();
		const node = ctx.createGain();
		node.connect(ctx.destination);
		const transition = createPreviewGainTransition(node.gain);
		source(ctx, node);
		checks.push(
			measure(
				"retarget after completed ramp preserves long constant hold",
				await render(ctx, [
					{
						frame: START,
						run: () => transition.setTarget(0.25, ctx.currentTime, true),
					},
					{
						frame: 2048,
						run: () => transition.setTarget(0.75, ctx.currentTime, true),
					},
				]),
				(frame) =>
					frame < 2048
						? ramp(frame, START, 1, 0.25)
						: ramp(frame, 2048, 0.25, 0.75),
			),
		);
	}
	let meterPeaks: { track: number[]; combined: number[] } | undefined;
	{
		const ctx = context();
		const audioGraph = graph(ctx);
		audioGraph.setTrackMonitorGain(0, 1);
		audioGraph.setTrackVolumeGain(0, 0.5);
		graphSource(ctx, audioGraph);
		checks.push(
			measure(
				"global mute reaches exact zero while pre-global meters follow track ramp",
				await render(ctx, [
					{ frame: START, run: () => audioGraph.setOutputGain(0, true) },
					{
						frame: RETARGET,
						run: () => audioGraph.setTrackVolumeGain(0, 0.8, true),
					},
					{
						frame: 3584,
						run: () => {
							const snapshot = audioGraph.readMeterSnapshot(true, new Map());
							const track = snapshot.trackStates.track;
							const combined = snapshot.combinedState;
							assert(
								track.status === "ready" && combined.status === "ready",
								"Meter taps must be ready after global mute.",
							);
							meterPeaks = {
								track: track.channels.map((channel) => channel.peak),
								combined: combined.channels.map((channel) => channel.peak),
							};
							for (const peaks of [meterPeaks.track, meterPeaks.combined]) {
								assert(
									peaks.length === 2,
									"Meter taps must preserve stereo channels.",
								);
								peaks.forEach((peak, channel) =>
									assert(
										Math.abs(peak - [0.6, 0.2][channel]) < TOLERANCE,
										`Pre-global meter changed after mute: channel ${channel}, peak ${peak}`,
									),
								);
							}
						},
					},
				]),
				(frame, channel) =>
					[0.75, 0.25][channel] *
					ramp(frame, RETARGET, 0.5, 0.8) *
					ramp(frame, START, 1, 0),
			),
		);
		audioGraph.destroy();
	}
	const candidates = [];
	for (const milliseconds of [5, 8, 10]) {
		const ctx = context();
		const node = ctx.createGain();
		node.connect(ctx.destination);
		source(ctx, node);
		node.gain.setValueAtTime(1, START / RATE);
		node.gain.linearRampToValueAtTime(0, START / RATE + milliseconds / 1000);
		const metrics = measure(
			`${milliseconds} ms reference ramp`,
			await render(ctx),
			(frame) => ramp(frame, START, 1, 0, (milliseconds * RATE) / 1000),
		);
		candidates.push({ milliseconds, ...metrics });
	}
	assert(
		candidates[1].maxAdjacentDelta < candidates[0].maxAdjacentDelta,
		"8 ms must reduce adjacent-sample gain change compared with 5 ms.",
	);
	return {
		passed: true,
		sampleRate: RATE,
		userAgent: navigator.userAgent,
		transitionMilliseconds: PREVIEW_GAIN_TRANSITION_SECONDS * 1000,
		checks,
		meterPeaks,
		candidates,
		selection:
			"8 ms limits full-scale gain delta to about 0.0026042/sample versus 0.0041667 at 5 ms, and reaches exact zero 2 ms sooner than 10 ms. PCM checks establish continuity and bounded endpoints; they do not establish perceptual inaudibility.",
	};
}

Object.assign(window, { runPreviewGainTransitionChecks });
const button = document.querySelector<HTMLButtonElement>("#run");
const result = document.querySelector<HTMLPreElement>("#result");
button?.addEventListener("click", async () => {
	button.disabled = true;
	try {
		const summary = await runPreviewGainTransitionChecks();
		if (result) result.textContent = JSON.stringify(summary, null, 2);
	} catch (error) {
		if (result)
			result.textContent =
				error instanceof Error ? (error.stack ?? error.message) : String(error);
		throw error;
	} finally {
		button.disabled = false;
	}
});
