import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateFixtures } from "../mediabunny-upgrade/fixtures.mjs";

export function prepareFixtures() {
	const fixtures = generateFixtures().filter(
		(fixture) => fixture.kind === "audio" || fixture.kind === "sync",
	);
	mkdirSync("tmp/waveform-gap", { recursive: true });
	for (const fixture of [...fixtures].filter(
		(entry) => !entry.gap && entry.kind === "audio",
	)) {
		const name = `leading-${fixture.name}.mkv`;
		const path = resolve("tmp/waveform-gap", name);
		execFileSync("ffmpeg", [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-itsoffset",
			"0.7",
			"-i",
			resolve("tmp/mediabunny-upgrade", fixture.name),
			"-c",
			"copy",
			"-copyts",
			"-avoid_negative_ts",
			"disabled",
			path,
		]);
		const probe = JSON.parse(
			execFileSync("ffprobe", [
				"-v",
				"error",
				"-show_packets",
				"-show_streams",
				"-of",
				"json",
				path,
			]),
		);
		fixtures.push({
			name,
			kind: "audio",
			gap: false,
			leadingOffset: true,
			bytes: readFileSync(path),
			probe,
		});
	}
	for (const gap of [false, true]) {
		const name = `pcm-${gap ? "gap" : "continuous"}.mkv`;
		const path = resolve("tmp/waveform-gap", name);
		execFileSync("ffmpeg", [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:sample_rate=48000:duration=5",
			...(gap ? ["-af", "aselect=not(between(t\\,2\\,3))"] : []),
			"-c:a",
			"pcm_s16le",
			path,
		]);
		const probe = JSON.parse(
			execFileSync("ffprobe", [
				"-v",
				"error",
				"-show_packets",
				"-show_streams",
				"-of",
				"json",
				path,
			]),
		);
		fixtures.push({
			name,
			kind: "audio",
			gap,
			bytes: readFileSync(path),
			probe,
		});
	}

	return fixtures;
}

export function prepareVideoFixture() {
	generateFixtures();
	const directory = resolve("tmp/waveform-gap");
	mkdirSync(directory, { recursive: true });
	const source = resolve(directory, "video-gap.mkv");
	execFileSync("ffmpeg", [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		"tmp/mediabunny-upgrade/long-gop.mp4",
		"-i",
		"tmp/mediabunny-upgrade/libopus-gap.webm",
		"-map",
		"0:v",
		"-map",
		"1:a",
		"-c",
		"copy",
		"-t",
		"5.1",
		source,
	]);
	return { directory, source };
}
