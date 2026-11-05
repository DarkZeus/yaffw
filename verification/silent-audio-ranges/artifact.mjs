import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
export function probe(file) {
	return JSON.parse(
		execFileSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-show_streams",
				"-show_format",
				"-show_packets",
				"-of",
				"json",
				file,
			],
			{ maxBuffer: 10e6 },
		),
	);
}
export function inspect(file, expectAudio, audible) {
	const metadata = probe(file);
	const audio = metadata.streams.filter((s) => s.codec_type === "audio");
	assert.equal(audio.length, expectAudio ? 1 : 0);
	if (expectAudio) {
		assert.equal(audio[0].codec_name, "opus");
		assert.equal(audio[0].channels, 2);
		assert.equal(Number(audio[0].sample_rate), 48_000);
	}
	assert.ok(Math.abs(Number(metadata.format.duration) - 0.5) < 0.06);
	const video = metadata.streams.find((s) => s.codec_type === "video");
	assert.ok(video);
	const pixels = execFileSync("ffmpeg", [
		"-v",
		"error",
		"-i",
		file,
		"-vf",
		"scale=1:1",
		"-pix_fmt",
		"gray",
		"-f",
		"rawvideo",
		"-",
	]);
	const events = [];
	for (let i = 0; i < pixels.length; i++)
		if (pixels[i] > 120 && (i === 0 || pixels[i - 1] <= 120))
			events.push(i / 30);
	let rms = null;
	const onsets = [];
	if (expectAudio) {
		const pcm = execFileSync("ffmpeg", [
			"-v",
			"error",
			"-i",
			file,
			"-map",
			"0:a:0",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-f",
			"f32le",
			"-",
		]);
		let sum = 0;
		let active = false;
		for (let offset = 0; offset < pcm.length; offset += 960) {
			let peak = 0;
			for (let j = offset; j < Math.min(offset + 960, pcm.length); j += 4) {
				const value = pcm.readFloatLE(j);
				sum += value * value;
				peak = Math.max(peak, Math.abs(value));
			}
			const now = peak > 0.01;
			if (now && !active) onsets.push(offset / 4 / 48000);
			active = now;
		}
		rms = Math.sqrt(sum / (pcm.length / 4));
		assert.ok(audible ? rms > 0.02 : rms < 0.0001, `RMS ${rms}`);
		if (audible) {
			assert.equal(onsets.length, 1);
			assert.equal(events.length, 1);
			assert.ok(
				Math.abs(onsets[0] - events[0]) < 0.035,
				`A/V ${onsets[0]} vs ${events[0]}`,
			);
		}
	}
	return {
		streams: metadata.streams,
		duration: metadata.format.duration,
		rms,
		audioOnsets: onsets,
		videoOnsets: events,
	};
}
