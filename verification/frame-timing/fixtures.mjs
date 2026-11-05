import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const fixtureDirectory = resolve("tmp/frame-timing");
export const fixtures = [
	{ name: "fractional-cfr", rate: "30000/1001", frames: 360 },
	{
		name: "dropped-cfr",
		rate: "30",
		frames: 360,
		filter: "select='not(eq(mod(n,10),4))'",
	},
	{
		name: "vfr",
		rate: "30",
		frames: 360,
		filter: "settb=1/1000000,setpts='N*37000+7000*sin(N*1.7)'",
	},
	{ name: "single-frame", rate: "30", frames: 1 },
	{ name: "nonzero-start", rate: "30", frames: 360, filter: "setpts=PTS+2/TB" },
	{
		name: "late-vfr",
		rate: "30",
		frames: 600,
		filter:
			"settb=1/1000000,setpts='N*33333+if(lt(N,300),0,7000*sin((N-300)*1.7))'",
	},
];

export function generateFixtures() {
	mkdirSync(fixtureDirectory, { recursive: true });
	for (const fixture of fixtures) {
		const args = [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			`testsrc2=size=160x90:rate=${fixture.rate}`,
			"-frames:v",
			String(fixture.frames),
		];
		if (fixture.filter) args.push("-vf", fixture.filter);
		args.push(
			"-fps_mode",
			"passthrough",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-bf",
			"0",
			"-pix_fmt",
			"yuv420p",
			"-enc_time_base",
			"1/1000000",
			"-video_track_timescale",
			"1000000",
			"-avoid_negative_ts",
			"disabled",
			"-movflags",
			"+faststart",
			resolve(fixtureDirectory, `${fixture.name}.mp4`),
		);
		execFileSync("ffmpeg", args);
	}
}

export function probeFixture(name) {
	const result = JSON.parse(
		execFileSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_packets",
				"-show_streams",
				"-show_entries",
				"packet=pts_time,dts_time,duration_time:stream=time_base,start_time,avg_frame_rate,r_frame_rate,nb_frames",
				"-of",
				"json",
				resolve(fixtureDirectory, `${name}.mp4`),
			],
			{ maxBuffer: 16 * 1024 * 1024 },
		).toString(),
	);
	const pts = result.packets
		.map((packet) => Number(packet.pts_time))
		.sort((a, b) => a - b);
	const gaps = pts.slice(1).map((time, index) => time - pts[index]);
	assert.ok(pts.length > 0);
	assert.ok(
		gaps.every((gap) => gap > 0),
		"Packets must have distinct increasing presentation times",
	);
	const { time_base, start_time, avg_frame_rate, r_frame_rate, nb_frames } =
		result.streams[0];
	return {
		stream: { time_base, start_time, avg_frame_rate, r_frame_rate, nb_frames },
		packetCount: pts.length,
		firstTimestamp: pts[0],
		lastTimestamp: pts.at(-1),
		minGap: gaps.length ? Math.min(...gaps) : null,
		maxGap: gaps.length ? Math.max(...gaps) : null,
		presentationTimestamps: pts,
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateFixtures();
	console.log(
		JSON.stringify(
			fixtures.map(({ name }) => ({
				name,
				...probeFixture(name),
				presentationTimestamps: undefined,
			})),
			null,
			2,
		),
	);
}
