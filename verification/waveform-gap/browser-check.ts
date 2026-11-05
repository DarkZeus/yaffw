import { loadBrowserWaveformLane } from "../../src/editor-next/selection/waveform/selection-waveform-lanes";
import { checkAudio } from "../mediabunny-upgrade/browser-check";

export async function checkWaveform(base64: string, sync = false) {
	const source = new Blob([
		Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
	]);
	const workers: { messages: number; terminated: number; bytes: number }[] = [];
	const NativeWorker = globalThis.Worker;
	globalThis.Worker = class extends NativeWorker {
		private record = { messages: 0, terminated: 0, bytes: 0 };
		constructor(url: string | URL, options?: WorkerOptions) {
			super(url, options);
			workers.push(this.record);
			this.addEventListener("message", (event) => {
				this.record.messages++;
				this.record.bytes = event.data.result.samples?.byteLength ?? 0;
			});
		}
		terminate() {
			this.record.terminated++;
			super.terminate();
		}
	};
	try {
		const duration = sync ? 10 : 5.1;
		const request = {
			source,
			assetDurationUs: duration * 1_000_000,
			track: { id: "audio-0", kind: "audio" as const },
			trackIndex: 0,
		};
		const result = await loadBrowserWaveformLane(request);
		if (result.status !== "ready") throw new Error(result.reason);
		const cached = await loadBrowserWaveformLane(request);
		const cacheSame = cached === result;
		const bins = Array.from(
			{ length: Math.ceil(duration * 10) },
			(_, index) => {
				const time = index / 10;
				const samples = Array.from(result.samples).slice(
					Math.floor((time / duration) * 8192),
					Math.floor(((time + 0.05) / duration) * 8192),
				);
				return { time, peak: Math.max(...samples) };
			},
		);
		const controller = new AbortController();
		const aborted = loadBrowserWaveformLane({
			...request,
			source: source.slice(),
			signal: controller.signal,
		});
		controller.abort();
		let abortName = "did not reject";
		try {
			await aborted;
		} catch (error) {
			abortName = error instanceof Error ? error.name : String(error);
		}
		const missing = await loadBrowserWaveformLane({
			...request,
			source: source.slice(),
			trackIndex: 99,
		});
		const onsets: number[] = [];
		let active = false;
		for (let index = 0; index < result.samples.length; index++) {
			const audible = result.samples[index] > 0.01;
			const time = (index / result.samples.length) * duration;
			if (
				audible &&
				!active &&
				(onsets.length === 0 || time - onsets[onsets.length - 1] > 0.05)
			)
				onsets.push(time);
			active = audible;
		}
		return {
			onsets,
			count: result.samples.length,
			firstActiveSeconds:
				(Array.from(result.samples).findIndex((sample) => sample > 0.01) /
					8192) *
				duration,
			lastActiveSeconds:
				((8191 -
					Array.from(result.samples)
						.reverse()
						.findIndex((sample) => sample > 0.01) +
					1) /
					8192) *
				duration,
			bins,
			workers,
			cacheSame,
			abortName,
			unavailable: missing.status,
			reference: await checkAudio(base64, sync),
		};
	} finally {
		globalThis.Worker = NativeWorker;
	}
}
