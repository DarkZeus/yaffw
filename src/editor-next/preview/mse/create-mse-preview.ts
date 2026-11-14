import MseFragmentWorker from "./mse-fragment.worker.js?worker";

const MIB = 1024 * 1024;
const VIDEO_BUFFER_BYTES = 144 * MIB;
const APPEND_BYTES = 8 * MIB;
const LOOKAHEAD_SECONDS = 1.75;

type Fragment = { start: number; bytes: number };
type MediaIndex = {
	audioMime: string | null;
	videoMime: string;
	fragments: Fragment[];
	duration: number;
	videoDuration: number;
};
type FragmentPart = {
	buffer: ArrayBuffer;
	initBytes: number;
	mediaEnd: number;
	packetCount: number;
};
type FragmentParts = { video: FragmentPart; audio: FragmentPart | null };
type WorkerResult = MediaIndex | FragmentParts;
type WorkerResponse = { result: WorkerResult } | { error: string };

export type MsePreviewStats = {
	videoBudget: number;
	maxAppendedVideoBytes: number;
	maxFragmentBytes: number;
	appendedVideoBytes: number;
	evictions: number;
	fragmentsBuilt: number;
	verifiedVideoPackets: number;
	verifiedAudioPackets: number;
	coldSeeks: number;
	duration?: number;
	videoDuration?: number;
	fragmentCount?: number;
	maxInputVideoPayload?: number;
	error: string | null;
};

export function createMsePreview({
	file,
	verifyPackets = false,
}: {
	file: Blob;
	verifyPackets?: boolean;
}) {
	const mediaSource = new MediaSource();
	const worker = new MseFragmentWorker();
	const controller = new AbortController();
	const { signal } = controller;
	const url = URL.createObjectURL(mediaSource);
	const stats: MsePreviewStats = {
		videoBudget: VIDEO_BUFFER_BYTES,
		maxAppendedVideoBytes: 0,
		maxFragmentBytes: 0,
		appendedVideoBytes: 0,
		evictions: 0,
		fragmentsBuilt: 0,
		verifiedVideoPackets: 0,
		verifiedAudioPackets: 0,
		coldSeeks: 0,
		error: null,
	};
	let pendingRequest: {
		resolve: (result: WorkerResult) => void;
		reject: (error: Error) => void;
	} | null = null;
	worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
		const pending = pendingRequest;
		pendingRequest = null;
		if ("error" in data) pending?.reject(new Error(data.error));
		else pending?.resolve(data.result);
	};
	worker.onerror = (event) => pendingRequest?.reject(new Error(event.message));

	function request(
		message: { type: "open" } | { type: "fragment"; index: number },
	) {
		signal.throwIfAborted();
		return new Promise<WorkerResult>((resolve, reject) => {
			pendingRequest = { resolve, reject };
			worker.postMessage(
				message.type === "open"
					? { ...message, file, verify: verifyPackets }
					: message,
			);
		});
	}

	function close() {
		if (signal.aborted) return;
		controller.abort();
		pendingRequest?.reject(new Error("Preview closed."));
		pendingRequest = null;
		worker.terminate();
		URL.revokeObjectURL(url);
	}

	let isFragmentReady: ((time: number) => boolean) | undefined;

	async function waitForFragment(time: number, ownsPlayback: () => boolean) {
		while (!signal.aborted && ownsPlayback() && !isFragmentReady?.(time)) {
			await waitForPlayback();
		}
	}

	async function play(video: HTMLVideoElement, onReady?: () => void) {
		const [index] = await Promise.all([
			request({ type: "open" }),
			mediaSource.readyState === "closed"
				? waitForMediaEvent(mediaSource, "sourceopen", signal)
				: Promise.resolve(),
		]);
		if (!("fragments" in index)) throw new Error("Expected a media index.");
		const { audioMime, videoMime, fragments, duration, videoDuration } = index;
		const videoBuffer = mediaSource.addSourceBuffer(videoMime);
		const audioBuffer = audioMime
			? mediaSource.addSourceBuffer(audioMime)
			: null;
		const buffers = audioBuffer ? [videoBuffer, audioBuffer] : [videoBuffer];
		mediaSource.duration = duration;
		stats.duration = duration;
		stats.videoDuration = videoDuration;
		stats.fragmentCount = fragments.length;
		stats.maxInputVideoPayload = fragments.reduce(
			(max, fragment) => Math.max(max, fragment.bytes),
			0,
		);
		const appended = new Map<number, number>();
		let desiredSeek: number | null = null;
		let nextIndex = 0;
		let firstFragmentAfterSeek: number | null = null;
		let loadedEnd = 0;
		let ready = false;

		const fragmentEnd = (position: number) =>
			fragments[position + 1]?.start ?? duration;
		isFragmentReady = (time) => {
			if (time >= duration) return true;
			const position = findFragment(fragments, time);
			return (
				desiredSeek === null && position < nextIndex && appended.has(position)
			);
		};

		video.addEventListener(
			"seeking",
			() => {
				const position = video.currentTime;
				if (
					desiredSeek === null &&
					(contains(video.buffered, position) || position >= duration)
				)
					return;
				desiredSeek = position;
				stats.coldSeeks++;
			},
			{ signal },
		);

		async function trim(buffer: SourceBuffer, end: number) {
			if (buffer.buffered.length === 0) return;
			await waitForMediaEvent(buffer, "updateend", signal, () =>
				buffer.remove(0, end),
			);
		}

		async function reset(time: number) {
			for (const buffer of buffers) {
				if (mediaSource.readyState === "open") buffer.abort();
				await trim(buffer, duration);
			}
			stats.appendedVideoBytes = 0;
			appended.clear();
			nextIndex = findFragment(fragments, time);
			firstFragmentAfterSeek = nextIndex;
			loadedEnd = fragments[nextIndex].start;
		}

		async function evict() {
			let end = 0;
			let bytesRemoved = 0;
			// A paused seek at the boundary must be able to buffer the next
			// fragment without consuming the guard interval through playback.
			const guard = video.paused ? 0 : 0.045;
			for (const [position, bytes] of appended) {
				const boundary = fragmentEnd(position);
				// Keep the current group, including the decode dependencies of its B-frames.
				if (position >= nextIndex || boundary + guard > video.currentTime)
					break;
				appended.delete(position);
				bytesRemoved += bytes;
				end = boundary;
			}
			if (end === 0) return;
			await trim(videoBuffer, end);
			if (audioBuffer && end > 1) await trim(audioBuffer, end - 1);
			stats.appendedVideoBytes -= bytesRemoved;
			stats.evictions++;
		}

		const initialized = new Set<SourceBuffer>();
		async function append(buffer: SourceBuffer, part: FragmentPart) {
			const bytes = new Uint8Array(part.buffer);
			if (!initialized.has(buffer)) {
				await waitForMediaEvent(buffer, "updateend", signal, () =>
					buffer.appendBuffer(bytes.subarray(0, part.initBytes)),
				);
				initialized.add(buffer);
			}
			for (let offset = part.initBytes; offset < part.mediaEnd;) {
				if (signal.aborted || desiredSeek !== null) return;
				const end =
					nextIndex === firstFragmentAfterSeek
						? part.mediaEnd
						: Math.min(part.mediaEnd, offset + APPEND_BYTES);
				const added = end - offset;
				if (
					buffer === videoBuffer &&
					stats.appendedVideoBytes + added > VIDEO_BUFFER_BYTES
				) {
					await evict();
					if (stats.appendedVideoBytes + added > VIDEO_BUFFER_BYTES) {
						await waitForPlayback();
						continue;
					}
				}
				await waitForMediaEvent(buffer, "updateend", signal, () =>
					buffer.appendBuffer(bytes.subarray(offset, end)),
				);
				if (buffer === videoBuffer) {
					stats.appendedVideoBytes += added;
					appended.set(nextIndex, (appended.get(nextIndex) ?? 0) + added);
					stats.maxAppendedVideoBytes = Math.max(
						stats.maxAppendedVideoBytes,
						stats.appendedVideoBytes,
					);
				}
				offset = end;
			}
		}

		while (!signal.aborted) {
			if (video.error) throw new Error(video.error.message);
			if (desiredSeek !== null) {
				const time = desiredSeek;
				desiredSeek = null;
				await reset(time);
				continue;
			}
			await evict();
			if (nextIndex === fragments.length) {
				if (mediaSource.readyState === "open") mediaSource.endOfStream();
				await waitForPlayback();
				continue;
			}
			if (loadedEnd > video.currentTime + LOOKAHEAD_SECONDS) {
				await waitForPlayback();
				continue;
			}

			const parts = await request({ type: "fragment", index: nextIndex });
			if (!("video" in parts)) throw new Error("Expected a media fragment.");
			stats.fragmentsBuilt++;
			stats.maxFragmentBytes = Math.max(
				stats.maxFragmentBytes,
				parts.video.mediaEnd - parts.video.initBytes,
			);
			if (verifyPackets) {
				stats.verifiedVideoPackets += parts.video.packetCount;
				stats.verifiedAudioPackets += parts.audio?.packetCount ?? 0;
			}
			if (desiredSeek !== null) continue;
			if (audioBuffer && parts.audio) await append(audioBuffer, parts.audio);
			await append(videoBuffer, parts.video);
			if (desiredSeek !== null) continue;
			loadedEnd = fragmentEnd(nextIndex++);
			firstFragmentAfterSeek = null;
			if (!ready) {
				ready = true;
				onReady?.();
			}
		}
	}

	return { url, play, close, stats, waitForFragment };
}

function findFragment(fragments: Fragment[], seconds: number) {
	let index = fragments.length - 1;
	while (index > 0 && fragments[index].start > seconds) index--;
	return index;
}

function contains(ranges: TimeRanges, time: number) {
	for (let index = 0; index < ranges.length; index++) {
		if (ranges.start(index) <= time && time < ranges.end(index)) return true;
	}
	return false;
}

function waitForMediaEvent(
	target: EventTarget,
	name: "sourceopen" | "updateend",
	signal: AbortSignal,
	operation?: () => void,
) {
	signal.throwIfAborted();
	return new Promise<void>((resolve, reject) => {
		const listeners = new AbortController();
		const options = { once: true, signal: listeners.signal };
		function finish(error?: unknown) {
			listeners.abort();
			if (error) reject(error);
			else resolve();
		}
		target.addEventListener(name, () => finish(), options);
		target.addEventListener(
			"error",
			() => finish(new Error(`Error waiting for ${name}.`)),
			options,
		);
		signal.addEventListener(
			"abort",
			() => finish(new Error("Preview closed.")),
			options,
		);
		try {
			operation?.();
		} catch (error) {
			finish(error);
		}
	});
}

function waitForPlayback() {
	return new Promise<void>((resolve) => setTimeout(resolve, 25));
}
