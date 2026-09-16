import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(
	new URL(
		"../../public/export-correctness-fixtures/sync-flash-click.mp4",
		import.meta.url,
	),
);
const manifestPath = fileURLToPath(
	new URL("./fixture-manifest.json", import.meta.url),
);
export const audioThreshold = 0.005;

// Group carrier crossings into clicks, using observed silence rather than known event times.
export function detectAudioEvents(
	samples,
	sampleRate,
	threshold = audioThreshold,
) {
	const events = [];
	let previous = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < samples.length; index++) {
		if (Math.abs(samples[index]) <= threshold) continue;
		if (index - previous > sampleRate * 0.05) events.push(index / sampleRate);
		previous = index;
	}
	return events;
}

export function detectVideoEvents(luminance, timestamps, threshold = 128) {
	assert.equal(
		luminance.length,
		timestamps.length,
		"Every decoded frame requires its own PTS",
	);
	return timestamps.filter(
		(_, index) =>
			luminance[index] > threshold &&
			(index === 0 || luminance[index - 1] <= threshold),
	);
}

export function validateSignals(videoTimes, audioTimes) {
	assert.equal(videoTimes.length, 9, "Expected nine decoded flashes");
	assert.equal(audioTimes.length, 9, "Expected nine decoded clicks");
	return videoTimes.map((videoTimeSeconds, index) => {
		const audioTimeSeconds = audioTimes[index];
		assert.ok(
			Math.abs(videoTimeSeconds - (index + 1)) < 0.001,
			`Flash ${index + 1} must start at its intended source time`,
		);
		assert.ok(
			Math.abs(audioTimeSeconds - videoTimeSeconds) <= 0.001,
			`Click ${index + 1} must align within 1 ms of its decoded flash`,
		);
		return {
			id: index + 1,
			videoTimeSeconds,
			audioTimeSeconds,
			fixtureOffsetMs: (audioTimeSeconds - videoTimeSeconds) * 1000,
		};
	});
}

export function measureFixture(inputPath = fixture) {
	const run = (program, args) =>
		execFileSync(program, args, { maxBuffer: 32 * 1024 * 1024 });
	const probe = JSON.parse(
		run("ffprobe", [
			"-v",
			"error",
			"-show_streams",
			"-show_format",
			"-of",
			"json",
			inputPath,
		]).toString(),
	);
	const video = probe.streams.find((stream) => stream.codec_type === "video");
	const audio = probe.streams.find((stream) => stream.codec_type === "audio");
	assert.equal(Number(video.start_time), 0);
	assert.equal(
		Number(audio.start_time),
		0,
		"PCM sample zero must correspond to source time zero",
	);
	const frames = JSON.parse(
		run("ffprobe", [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_frames",
			"-show_entries",
			"frame=best_effort_timestamp_time",
			"-of",
			"json",
			inputPath,
		]).toString(),
	).frames;
	const timestamps = frames.map((frame) =>
		Number(frame.best_effort_timestamp_time),
	);
	const luminance = run("ffmpeg", [
		"-v",
		"error",
		"-i",
		inputPath,
		"-map",
		"0:v:0",
		"-vf",
		"scale=1:1,format=gray",
		"-fps_mode",
		"passthrough",
		"-f",
		"rawvideo",
		"pipe:1",
	]);
	const pcm = run("ffmpeg", [
		"-v",
		"error",
		"-i",
		inputPath,
		"-map",
		"0:a:0",
		"-ac",
		"1",
		"-f",
		"f32le",
		"pipe:1",
	]);
	const samples = Float32Array.from({ length: pcm.length / 4 }, (_, index) =>
		pcm.readFloatLE(index * 4),
	);
	const sampleRate = Number(audio.sample_rate);
	const [numerator, denominator] = video.avg_frame_rate.split("/").map(Number);
	const frameRate = numerator / denominator;
	const events = validateSignals(
		detectVideoEvents(luminance, timestamps),
		detectAudioEvents(samples, sampleRate),
	);
	return {
		url: "/export-correctness-fixtures/sync-flash-click.mp4",
		sha256: createHash("sha256").update(readFileSync(inputPath)).digest("hex"),
		durationSeconds: Number(probe.format.duration),
		frameRate,
		sampleRate,
		thresholds: {
			audioAbsoluteAmplitude: audioThreshold,
			videoLuminance: 128,
			audioSilenceGapSeconds: 0.05,
		},
		uncertainty: {
			audioSampleMs: 1000 / sampleRate,
			videoFrameIntervalMs: 1000 / frameRate,
			fixtureAlignmentToleranceMs: 1,
			note: "Frame onset uses decoded presentation timestamps, with one audio-sample timing resolution. Video frame interval is the display quantization, not a measured device presentation error. AAC threshold crossing introduces a measured offset recorded per event.",
		},
		events,
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const manifest = measureFixture();
	if (process.argv.includes("--write"))
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	else
		assert.deepEqual(
			manifest,
			JSON.parse(readFileSync(manifestPath, "utf8")),
			"Fixture measurement changed; inspect signals before accepting a replacement manifest with --write",
		);
	console.log(
		JSON.stringify(
			{
				status: "pass",
				sha256: manifest.sha256,
				events: manifest.events,
				uncertainty: manifest.uncertainty,
			},
			null,
			2,
		),
	);
}
