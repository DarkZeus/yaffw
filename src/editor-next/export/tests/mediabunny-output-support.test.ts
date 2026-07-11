import { describe, expect, it } from "vitest";

import { getMediabunnyOutputSupport } from "../adapters/mediabunny-output-support";

describe("Mediabunny output support", () => {
	it("exposes video containers and their documented video codec order", () => {
		const support = getMediabunnyOutputSupport();

		expect(support.containers.map(({ id }) => id)).toEqual([
			"mp4",
			"mov",
			"mkv",
			"webm",
			"mpeg-ts",
		]);
		expect(
			support.containers.find(({ id }) => id === "webm")?.videoCodecs,
		).toEqual(["vp9", "av1", "vp8"]);
		expect(
			support.containers.find(({ id }) => id === "webm")?.audioCodecs,
		).toEqual(["opus", "vorbis"]);
	});
});
