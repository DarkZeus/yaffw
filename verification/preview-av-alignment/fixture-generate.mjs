// Optional replacement-fixture recipe. The browser baseline uses the existing
// committed fixture; this recipe does not claim byte identity with that asset.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { measureFixture } from "./fixture-validation.mjs";

const output = process.argv[2];
assert.ok(
	output,
	"Usage: node fixture-generate.mjs /absolute/path/to/new-fixture.mp4 (will not overwrite an existing file)",
);
const directory = mkdtempSync(join(tmpdir(), "yaffw-av-fixture-"));
try {
	// Raw raster/sample generation: full-frame flashes and a 1 kHz sine burst.
	const video = Buffer.alloc(160 * 90 * 500);
	for (let frame = 0; frame < 500; frame++) {
		if (frame >= 50 && frame % 50 < 5)
			video.fill(255, frame * 160 * 90, (frame + 1) * 160 * 90);
	}
	const audio = Buffer.alloc(480000 * 4);
	for (let sample = 0; sample < 480000; sample++) {
		if (sample >= 48000 && sample % 48000 < 4800)
			audio.writeFloatLE(
				0.1 * Math.sin((2 * Math.PI * 1000 * sample) / 48000),
				sample * 4,
			);
	}
	const videoPath = join(directory, "frames.gray");
	const audioPath = join(directory, "samples.f32le");
	writeFileSync(videoPath, video);
	writeFileSync(audioPath, audio);
	execFileSync("ffmpeg", [
		"-v",
		"error",
		"-n",
		"-f",
		"rawvideo",
		"-pixel_format",
		"gray",
		"-video_size",
		"160x90",
		"-framerate",
		"50",
		"-i",
		videoPath,
		"-f",
		"f32le",
		"-ar",
		"48000",
		"-ac",
		"1",
		"-i",
		audioPath,
		"-c:v",
		"libx264",
		"-profile:v",
		"baseline",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-movflags",
		"+faststart",
		resolve(output),
	]);
	console.log(
		JSON.stringify(
			{ output: resolve(output), validation: measureFixture(resolve(output)) },
			null,
			2,
		),
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
