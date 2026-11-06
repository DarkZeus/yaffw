import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { generateFixtures } from "./fixtures.mjs";

const baseline = "234286135b2c2af3272ec94fc4a4392fd607e792";
const owner = "src/editor-next/preview/scrub/";
const directory = resolve("tmp/scrub-index");
mkdirSync(directory, { recursive: true });
function original(path) {
	return execFileSync("git", ["show", `${baseline}:${path}`], {
		encoding: "utf8",
	});
}
function replace(source, before, after) {
	assert.ok(source.includes(before), `Instrumentation anchor: ${before}`);
	return source.replace(before, after);
}
const production = readFileSync(
	`${owner}mediabunny-scrub-frame-provider.ts`,
	"utf8",
);
assert.equal(
	JSON.parse(readFileSync("node_modules/mediabunny/package.json", "utf8"))
		.version,
	"1.65.2",
);
function instrument(originalSource, historical = false) {
	let source = originalSource.replace(
		/from "(\.[^"]+)"/g,
		(match, specifier) =>
			historical && specifier === "./keyframe-index"
				? match
				: `from "${posix.join("/", owner, specifier)}"`,
	);
	source = replace(
		source,
		"new BlobSource(source, {\n\t\t\t\thandleUnhandledError: sourceFailure.handleUnhandledError,\n\t\t\t})",
		"countSource(new BlobSource(source, { handleUnhandledError: sourceFailure.handleUnhandledError }))",
	);
	source = replace(
		source,
		"\t\t\tpacketSink = new EncodedPacketSink(videoTrack);",
		"\t\t\tglobalThis.__scrubProbe.ready = true;\n\t\t\tpacketSink = new EncodedPacketSink(videoTrack);",
	);
	return `${source}\nfunction countSource(source) { source.on("read", ({start,end}) => { globalThis.__scrubProbe.bytes += end-start; globalThis.__scrubProbe.reads++; }); return source; }\n`;
}
const indexed = instrument(
	original(`${owner}mediabunny-scrub-frame-provider.ts`),
	true,
);
const direct = instrument(production);
assert.ok(!direct.includes("keyframeIndex"));
writeFileSync(resolve(directory, "indexed.ts"), indexed);
writeFileSync(resolve(directory, "direct.ts"), direct);
let index = original(`${owner}keyframe-index.ts`);
index = replace(
	index,
	"timestamps.push(packet.timestamp);",
	"timestamps.push(packet.timestamp); globalThis.__scrubProbe.indexEntries++;",
);
index = replace(
	index,
	"complete = true;",
	"complete = true; globalThis.__scrubProbe.indexComplete = true;",
);
writeFileSync(resolve(directory, "keyframe-index.ts"), index);
const fixtures = generateFixtures();
import { launchBrowser } from "../browser.cjs";
const browser = await launchBrowser();
const results = [];
try {
	for (let trial = 0; trial < 3; trial++)
		for (const fixture of fixtures)
			for (const preparation of ["immediate", "prepared"])
				for (const variant of trial % 2
					? ["direct", "indexed"]
					: ["indexed", "direct"]) {
					const page = await browser.newPage();
					await page.routeWebSocket("**", (socket) => socket.close());
					await page.goto(process.env.YAFFW_ORIGIN || "http://127.0.0.1:3000");
					const observed = await page.evaluate(
						async (args) => {
							const harness = await import(
								"/verification/scrub-index/browser-check.ts"
							);
							return harness.compare(args);
						},
						{
							base64: fixture.bytes.toString("base64"),
							variant,
							preparation,
							duration: fixture.duration,
						},
					);
					const packets = fixture.probe.packets
						.filter((p) => p.codec_type === "video")
						.map((p) => Number(p.pts_time));
					for (const frame of observed.frames) {
						const expected = Math.round(
							Math.max(...packets.filter((t) => t <= frame.target)) * 1e6,
						);
						assert.equal(
							frame.actualTimestampUs,
							expected,
							`${fixture.name} ${variant} ${frame.target}`,
						);
					}
					assert.equal(
						observed.reversalFrames.length,
						1,
						"Only latest rapid reversal presents",
					);
					assert.equal(
						observed.reversalFrames[0].timestampUs,
						Math.round((fixture.duration - 1.37) * 1e6),
					);
					assert.equal(
						observed.afterDispose,
						0,
						"No obsolete frame after disposal",
					);
					results.push({
						trial,
						fixture: fixture.name,
						preparation,
						variant,
						...observed,
					});
					writeFileSync(
						resolve(directory, "partial.json"),
						JSON.stringify(results),
					);
					console.log(
						`PASS ${trial} ${fixture.name} ${preparation} ${variant}`,
					);
					await page.close();
				}
	const evidence = {
		baseline,
		candidateSourceSha256: createHash("sha256")
			.update(production)
			.digest("hex"),
		recordedAt: new Date().toISOString(),
		browser: await browser.version(),
		mediabunny: JSON.parse(
			readFileSync("node_modules/mediabunny/package.json", "utf8"),
		).version,
		fixtures: fixtures.map(({ bytes, probe, ...f }) => ({
			...f,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			bytes: bytes.length,
			packetCount: probe.packets.length,
		})),
		results,
	};
	writeFileSync(
		resolve(directory, "evidence.json"),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
} finally {
	await browser.close();
}
