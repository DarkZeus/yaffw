import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export function prepareFixture() {
	const directory = resolve("tmp/silent-audio-ranges");
	mkdirSync(directory, { recursive: true });
	const source = resolve(directory, "silent-ranges.mkv");
	if (!existsSync(source) || process.env.YAFFW_REGENERATE_FIXTURE === "1")
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"nullsrc=s=160x90:r=30:d=6,geq=lum='if(lt(mod(T,0.5),0.12),200,20)':cb=128:cr=128",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:sample_rate=48000:duration=6",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=880:sample_rate=44100:duration=6",
			"-filter_complex",
			"[1:a]aselect='between(t,1,5)*not(between(t,2,3))'[sparse];[2:a]volume='if(lt(mod(t,0.5),0.12),1,0)':eval=frame[audible]",
			"-map",
			"0:v",
			"-map",
			"[sparse]",
			"-map",
			"[audible]",
			"-c:v",
			"libx264",
			"-g",
			"15",
			"-bf",
			"0",
			"-c:a",
			"libopus",
			source,
		]);

	return { directory, source };
}
