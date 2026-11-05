import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { generateFixtures } from "../copy-boundaries/fixtures.mjs";

mkdirSync("tmp/file-backed-export", { recursive: true });
generateFixtures();
if (!existsSync("tmp/file-backed-export/large.mp4")) {
	execFileSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=1280x720:rate=30:duration=16",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=700:sample_rate=48000:duration=16",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=1100:sample_rate=48000:duration=16",
		"-map",
		"0:v",
		"-map",
		"1:a",
		"-map",
		"2:a",
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-b:v",
		"40M",
		"-minrate",
		"40M",
		"-maxrate",
		"40M",
		"-bufsize",
		"40M",
		"-x264-params",
		"nal-hrd=cbr:force-cfr=1",
		"-g",
		"60",
		"-bf",
		"2",
		"-c:a",
		"aac",
		"-movflags",
		"+faststart",
		"tmp/file-backed-export/large.mp4",
	]);
}
