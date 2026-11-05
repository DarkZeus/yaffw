import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const WIDTH = 160;
const HEIGHT = 96;
const SAMPLE_RATE = 48000;

async function run(program, args) {
	const { stdout } = await execute(program, args, {
		encoding: "buffer",
		maxBuffer: 256 * 1024 * 1024,
	});
	return stdout;
}

async function probe(file, args = []) {
	return JSON.parse(
		(
			await run("ffprobe", ["-v", "error", ...args, "-of", "json", file])
		).toString(),
	);
}

function numeric(value) {
	const number = Number(value);
	return value !== undefined && value !== "N/A" && Number.isFinite(number)
		? number
		: null;
}

function frameRecord(frame) {
	return {
		pts: numeric(frame.best_effort_timestamp_time ?? frame.pts_time),
		duration: numeric(frame.duration_time ?? frame.pkt_duration_time),
		keyFrame: frame.key_frame === 1,
	};
}

/** Decode the original source tick, little-endian, from the twelve luminance cells. */
export function decodeIdentity(gray) {
	if (gray.length !== WIDTH * HEIGHT)
		throw new Error("Expected a 160x96 gray frame");
	let id = 0;
	for (let bit = 0; bit < 12; bit++) {
		let sum = 0;
		// Sample the center to avoid ringing at cell edges after lossy encoding.
		for (let y = 6; y < 10; y++) {
			for (let x = 6 + bit * 8; x < 10 + bit * 8; x++)
				sum += gray[y * WIDTH + x];
		}
		const mean = sum / 16;
		if (mean > 80 && mean < 168)
			throw new Error(`Ambiguous identity cell ${bit}: ${mean}`);
		if (mean >= 124) id |= 1 << bit;
	}
	return id;
}

/** Use actual adjacent sample timestamps, including VFR gaps, as source intervals. */
export function analyzePresentedFrames(frames, sourceFrames = null) {
	if (!frames.length) throw new Error("No presented video frames");
	const sources =
		sourceFrames && new Map(sourceFrames.map((frame) => [frame.id, frame]));
	const result = frames.map((frame, index) => {
		if (!Number.isFinite(frame.pts))
			throw new Error("Video frame has no presentation timestamp");
		const next = frames[index + 1];
		const duration = next ? next.pts - frame.pts : frame.duration;
		if (duration !== null && !(duration > 0))
			throw new Error(`Invalid presentation interval at frame ${index}`);
		const record = {
			...frame,
			duration,
			end: duration === null ? null : frame.pts + duration,
		};
		if (sources) {
			const source = sources.get(frame.id);
			if (!source) throw new Error(`Unknown source frame identity ${frame.id}`);
			record.sourcePts = source.pts;
			record.sourceEnd = source.end;
		}
		return record;
	});
	return {
		frames: result,
		start: result[0].pts,
		end: result.at(-1).end,
		...(sources
			? {
					sourceStart: result[0].sourcePts,
					sourceEnd: result.at(-1).sourceEnd,
					mappedSourceEnd: Number.isFinite(result.at(-1).duration)
						? result.at(-1).sourcePts + result.at(-1).duration
						: null,
				}
			: {}),
	};
}

/** Measure visible sample boundaries, without treating a source interval as output duration. */
export function measurePresentedBoundaryEvidence(presented, selection) {
	const last = presented.frames.at(-1);
	if (
		!last ||
		!Number.isFinite(presented.start) ||
		!Number.isFinite(presented.end) ||
		!Number.isFinite(presented.sourceStart) ||
		!Number.isFinite(last.sourcePts) ||
		!Number.isFinite(last.duration) ||
		!Number.isFinite(selection.start) ||
		!Number.isFinite(selection.end)
	)
		return { kind: "none" };
	return {
		kind: "start-and-end",
		startDeltaUs: Math.round((presented.sourceStart - selection.start) * 1e6),
		endDeltaUs: Math.round(
			(last.sourcePts + last.duration - selection.end) * 1e6,
		),
	};
}

/** Find active 5 ms envelope bins, joining short codec/ringing gaps within each burst. */
export function detectClicks(samples, sampleRate, start = 0) {
	let peak = 0;
	for (const value of samples) peak = Math.max(peak, Math.abs(value));
	if (peak < 0.02) return [];
	const threshold = Math.max(0.02, peak * 0.15);
	const binSize = Math.max(1, Math.round(sampleRate * 0.005));
	const clicks = [];
	let lastActive = Number.NEGATIVE_INFINITY;
	for (let offset = 0; offset < samples.length; offset += binSize) {
		let first = null;
		for (
			let index = offset;
			index < Math.min(offset + binSize, samples.length);
			index++
		) {
			if (Math.abs(samples[index]) >= threshold) {
				first = index;
				break;
			}
		}
		if (first === null) continue;
		if (offset - lastActive > sampleRate * 0.025)
			clicks.push({ pts: start + first / sampleRate, sample: first });
		lastActive = offset;
	}
	return clicks;
}

export function detectFlashes(frames) {
	const flashes = [];
	for (let index = 0; index < frames.length; index++) {
		if (frames[index].flash && (index === 0 || !frames[index - 1].flash)) {
			flashes.push({
				id: frames[index].id,
				pts: frames[index].pts,
				sourcePts: frames[index].sourcePts ?? frames[index].pts,
			});
		}
	}
	return flashes;
}

async function inspectVideo(file) {
	const metadata = await probe(file, [
		"-select_streams",
		"v:0",
		"-show_streams",
		"-show_frames",
	]);
	const stream = metadata.streams?.[0];
	if (!stream) throw new Error(`No video stream: ${file}`);
	const pixels = await run("ffmpeg", [
		"-v",
		"error",
		"-i",
		file,
		"-map",
		"0:v:0",
		"-vf",
		"scale=160:96",
		"-fps_mode",
		"passthrough",
		"-f",
		"rawvideo",
		"-pix_fmt",
		"gray",
		"pipe:1",
	]);
	const frames = (metadata.frames ?? []).map(frameRecord);
	if (pixels.length !== frames.length * WIDTH * HEIGHT) {
		throw new Error(
			`Decoded frame count differs from ffprobe: ${pixels.length / (WIDTH * HEIGHT)} vs ${frames.length}`,
		);
	}
	for (let index = 0; index < frames.length; index++) {
		const framePixels = pixels.subarray(
			index * WIDTH * HEIGHT,
			(index + 1) * WIDTH * HEIGHT,
		);
		frames[index].id = decodeIdentity(framePixels);
		let luminance = 0;
		for (let y = 32; y < 80; y++)
			for (let x = 120; x < 144; x++) luminance += framePixels[y * WIDTH + x];
		frames[index].flash = luminance / (48 * 24) > 124;
	}
	if (frames.length && !(frames.at(-1).duration > 0)) {
		const start = numeric(stream.start_time);
		const duration = numeric(stream.duration);
		const streamEnd =
			start !== null && duration !== null ? start + duration : null;
		frames.at(-1).duration =
			streamEnd !== null && streamEnd > frames.at(-1).pts
				? streamEnd - frames.at(-1).pts
				: null;
	}
	return frames;
}

async function inspectAudio(file) {
	const metadata = await probe(file, [
		"-select_streams",
		"a:0",
		"-show_streams",
		"-show_frames",
	]);
	const stream = metadata.streams?.[0];
	if (!stream) return null;
	const pcm = await run("ffmpeg", [
		"-v",
		"error",
		"-i",
		file,
		"-map",
		"0:a:0",
		"-ac",
		"1",
		"-ar",
		String(SAMPLE_RATE),
		"-f",
		"f32le",
		"pipe:1",
	]);
	const samples = new Float32Array(pcm.length / 4);
	for (let index = 0; index < samples.length; index++)
		samples[index] = pcm.readFloatLE(index * 4);
	const start =
		numeric(metadata.frames?.[0]?.best_effort_timestamp_time) ??
		numeric(stream.start_time) ??
		0;
	return {
		sampleRate: SAMPLE_RATE,
		start,
		duration: samples.length / SAMPLE_RATE,
		clicks: detectClicks(samples, SAMPLE_RATE, start),
	};
}

async function inspectEncoded(file) {
	const metadata = await probe(file, ["-show_format"]);
	const ignoreEditList =
		metadata.format?.format_name?.split(",").includes("mov") ?? false;
	const options = ignoreEditList ? ["-ignore_editlist", "1"] : [];
	const [packets, rawPackets, frames] = await Promise.all([
		probe(file, ["-select_streams", "v:0", "-show_packets"]),
		probe(file, [...options, "-select_streams", "v:0", "-show_packets"]),
		probe(file, [...options, "-select_streams", "v:0", "-show_frames"]),
	]);
	const packetRecord = (packet) => ({
		pts: numeric(packet.pts_time),
		dts: numeric(packet.dts_time),
		duration: numeric(packet.duration_time),
		flags: packet.flags,
	});
	const videoPackets = (packets.packets ?? []).map(packetRecord);
	const rawVideoPackets = (rawPackets.packets ?? []).map(packetRecord);
	const videoFrames = (frames.frames ?? []).map(frameRecord);
	return {
		ignoreEditList,
		videoPackets,
		rawVideoPackets,
		videoFrames,
		rawVideoFrames: videoFrames,
		negativePts: videoPackets.filter(
			(packet) => packet.pts !== null && packet.pts < 0,
		),
		negativeDtsOnly: videoPackets.filter(
			(packet) =>
				packet.dts !== null &&
				packet.dts < 0 &&
				!(packet.pts !== null && packet.pts < 0),
		),
		negativePreroll: videoPackets.filter(
			(packet) => packet.pts < 0 || packet.dts < 0,
		),
	};
}

export async function inspectSource(file) {
	const [frames, audio] = await Promise.all([
		inspectVideo(file),
		inspectAudio(file),
	]);
	const video = analyzePresentedFrames(frames);
	video.flashes = detectFlashes(video.frames);
	if (new Set(frames.map((frame) => frame.id)).size !== frames.length)
		throw new Error("Source frame identities must be unique");
	if (audio)
		audio.clicks = audio.clicks.map((click) => ({
			...click,
			sourceSecond: Math.round(click.pts),
		}));
	return { file, video, audio };
}

export async function inspectArtifact(file, sourceInfo, selection) {
	const [frames, audio, encoded] = await Promise.all([
		inspectVideo(file),
		inspectAudio(file),
		inspectEncoded(file),
	]);
	const presented = analyzePresentedFrames(frames, sourceInfo.video.frames);
	presented.flashes = detectFlashes(presented.frames);
	if (audio && sourceInfo.audio) {
		audio.clicks = audio.clicks.map((click) => {
			const expectedSourceTime = selection.start + click.pts - presented.start;
			const source = sourceInfo.audio.clicks.reduce(
				(best, candidate) =>
					!best ||
					Math.abs(candidate.pts - expectedSourceTime) <
						Math.abs(best.pts - expectedSourceTime)
						? candidate
						: best,
				null,
			);
			return {
				...click,
				sourceSecond: source?.sourceSecond ?? null,
				inferredSourcePts: source?.pts ?? null,
				alignmentError: source ? expectedSourceTime - source.pts : null,
			};
		});
	}
	return { file, selection, presented, encoded, audio };
}
