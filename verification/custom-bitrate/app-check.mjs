import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser } from "../browser.cjs";

const directory = resolve("tmp/custom-bitrate");
const origin = process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000";
const targetBps = 3_000_000;
const fixtures = [
	{ name: "60-fps", fps: 60 },
	{ name: "24-fps", fps: 24 },
	{ name: "variable-fps-trim", fps: 60, start: 2 },
];

function generateFixture({ name, fps, start }) {
	const file = resolve(directory, `fixture-${name}.mp4`);
	execFileSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc2=size=1280x720:rate=${fps}:duration=6`,
		// The first two seconds run at 15 fps. The trim starts at the
		// alternating frame intervals, which average 40 fps.
		...(start
			? [
					"-vf",
					"select=if(lt(n\\,120)\\,not(mod(n\\,4))\\,lt(mod(n\\,3)\\,2))",
					"-fps_mode",
					"vfr",
				]
			: []),
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-pix_fmt",
		"yuv420p",
		file,
	]);
	return file;
}

function inspectVideo(file) {
	const {
		packets,
		streams: [stream],
	} = JSON.parse(
		execFileSync("ffprobe", [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_packets",
			"-show_streams",
			"-show_entries",
			"packet=pts_time,size:stream=duration",
			"-of",
			"json",
			file,
		]),
	);
	return {
		bitrate:
			packets.reduce((bits, packet) => bits + Number(packet.size) * 8, 0) /
			Number(stream.duration),
		timestamps: packets
			.map((packet) => Number(packet.pts_time))
			.sort((a, b) => a - b),
	};
}

mkdirSync(directory, { recursive: true });
const browser = await launchBrowser();
try {
	console.log(`Browser ${browser.version()}`);
	for (const fixture of fixtures) {
		const source = generateFixture(fixture);
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			acceptDownloads: true,
		});
		try {
			await page.goto(origin);
			await page.waitForFunction(() => {
				const input = document.querySelector('input[type="file"]');
				return (
					input &&
					Object.keys(input).some((key) => key.startsWith("__reactProps"))
				);
			});
			await page.locator("input[type=file]").first().setInputFiles(source);
			if (fixture.start) {
				const transport = page.getByRole("region", {
					name: "Workbench transport region",
				});
				const seek = transport.getByRole("button", {
					name: "Seek forward 1 second",
					exact: true,
				});
				for (let i = 0; i < fixture.start; i++) await seek.click();
				await page.keyboard.press("[");
			}
			await page.getByRole("tab", { name: "Export", exact: true }).click();
			await page
				.getByRole("button", { name: "Output settings", exact: true })
				.click();
			const dialog = page.getByRole("dialog");
			await dialog.getByRole("tab", { name: "Video", exact: true }).click();
			await dialog
				.getByLabel("Video quality", { exact: true })
				.selectOption("custom-bitrate");
			await dialog
				.getByLabel("Custom video quality bitrate in Mbps")
				.fill(String(targetBps / 1_000_000));
			await dialog.getByRole("button", { name: "Apply", exact: true }).click();
			await page
				.getByRole("button", { name: "Start export", exact: true })
				.click();
			await page
				.getByText("Export complete", { exact: true })
				.waitFor({ timeout: 60_000 });
			const download = page.waitForEvent("download");
			await page
				.getByRole("button", { name: "Download export", exact: true })
				.click();
			const output = resolve(directory, `export-${fixture.name}.mp4`);
			await (await download).saveAs(output);

			const input = inspectVideo(source);
			const generated = inspectVideo(output);
			const start = fixture.start ?? 0;
			const expectedTimestamps = input.timestamps
				.filter((timestamp) => timestamp >= start)
				.map((timestamp) => timestamp - start);
			const bitrateMbps = (generated.bitrate / 1_000_000).toFixed(3);
			const result = `${fixture.name}: ${bitrateMbps} Mbps, ${generated.timestamps.length} frames`;
			assert.ok(Math.abs(generated.bitrate / targetBps - 1) <= 0.15, result);
			assert.equal(generated.timestamps.length, expectedTimestamps.length);
			for (const [index, timestamp] of generated.timestamps.entries()) {
				assert.ok(
					Math.abs(timestamp - expectedTimestamps[index]) <= 0.000002,
					`${fixture.name} frame ${index}`,
				);
			}
			console.log(`PASS ${result}`);
		} finally {
			await page.close();
		}
	}
} finally {
	await browser.close();
}
