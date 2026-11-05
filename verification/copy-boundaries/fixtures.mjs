import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function generateFixtures() {
	const directory = resolve("tmp/copy-boundaries");
	mkdirSync(directory, { recursive: true });
	// Raster fixture data, not UI color definitions. Twelve cells encode the
	// original 60 Hz tick even when the VFR filter removes a frame.
	const raw = Buffer.alloc(480 * 160 * 96, 24);
	for (let n = 0; n < 480; n++) {
		const frame = raw.subarray(n * 160 * 96, (n + 1) * 160 * 96);
		for (let bit = 0; bit < 12; bit++)
			for (let y = 4; y < 12; y++)
				for (let x = 4 + bit * 8; x < 12 + bit * 8; x++)
					frame[y * 160 + x] = n & (1 << bit) ? 224 : 24;
		for (let y = 24; y < 88; y++)
			for (let x = 112; x < 152; x++)
				frame[y * 160 + x] = n % 60 < 6 ? 224 : 24;
	}
	const rawFile = resolve(directory, "identity.gray");
	if (!existsSync(rawFile)) writeFileSync(rawFile, raw);
	const fixtures = [];
	for (const kind of ["cfr", "vfr"]) {
		const file = resolve(directory, `${kind}.mp4`);
		if (!existsSync(file) || process.env.YAFFW_REGENERATE_FIXTURE === "1")
			execFileSync("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-f",
				"rawvideo",
				"-pix_fmt",
				"gray",
				"-s",
				"160x96",
				"-r",
				"60",
				"-i",
				rawFile,
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=1000:sample_rate=48000:duration=8",
				"-filter_complex",
				`[0:v]${kind === "vfr" ? "select='lt(t,2)+gte(t,2)*not(eq(mod(n,3),1))'," : ""}format=yuv420p[v];[1:a]volume='if(lt(mod(t,1),0.1),1,0)':eval=frame[a]`,
				"-map",
				"[v]",
				"-map",
				"[a]",
				"-fps_mode",
				"vfr",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-crf",
				"12",
				"-g",
				"240",
				"-keyint_min",
				"240",
				"-sc_threshold",
				"0",
				"-bf",
				"3",
				"-c:a",
				"aac",
				"-b:a",
				"128k",
				file,
			]);
		const probe = JSON.parse(
			execFileSync(
				"ffprobe",
				[
					"-v",
					"error",
					"-show_frames",
					"-select_streams",
					"v:0",
					"-of",
					"json",
					file,
				],
				{ maxBuffer: 10e6 },
			),
		);
		assert.ok(probe.frames.some((frame) => frame.pict_type === "B"));
		const times = probe.frames.map((frame) =>
			Number(frame.best_effort_timestamp_time),
		);
		const spacings = times
			.slice(1)
			.map((time, i) => Math.round((time - times[i]) * 1e6));
		const spacingSpread = Math.max(...spacings) - Math.min(...spacings);
		assert.ok(kind === "vfr" ? spacingSpread > 10_000 : spacingSpread <= 2);
		assert.equal(times.length, kind === "vfr" ? 360 : 480);
		const keys = probe.frames
			.filter((frame) => frame.key_frame === 1)
			.map((frame) => Number(frame.best_effort_timestamp_time));
		assert.ok(keys[1] - keys[0] >= 4, "Long GOP confirmed independently");
		fixtures.push({
			file,
			kind,
			sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
			frameCount: times.length,
			spacingUs: [Math.min(...spacings), Math.max(...spacings)],
		});
	}
	return fixtures;
}
